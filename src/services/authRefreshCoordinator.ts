import type { AuthUser } from "../utils/authStorage";

export interface CoordinatedRefreshSuccess {
    accessToken: string;
    user?: AuthUser;
}

export interface CoordinatedRefreshFailure {
    kind: "auth" | "transient";
    code?: string;
    message?: string;
}

type RefreshSignal =
    | {
        type: "AUTH_REFRESH_INTENT";
        tabId: string;
        at: number;
    }
    | {
        type: "AUTH_REFRESH_SUCCESS";
        tabId: string;
        cycleId: string;
        at: number;
        accessToken?: string;
        user?: AuthUser;
    }
    | {
        type: "AUTH_REFRESH_FAILED";
        tabId: string;
        cycleId: string;
        at: number;
        failure: CoordinatedRefreshFailure;
    };

interface RefreshLease {
    owner: string;
    cycleId: string;
    expiresAt: number;
}

const CHANNEL_NAME = "ktc-auth-refresh-v1";
const LOCK_KEY = "ktcAuthRefreshLock";
const SIGNAL_KEY = "ktcAuthRefreshSignal";
const TAB_ID_KEY = "ktcAuthRefreshTabId";
const INTENT_PREFIX = "ktcAuthRefreshIntent:";
const LOCK_TTL_MS = 8_000;
const LOCK_HEARTBEAT_MS = 2_000;
const LOCK_SETTLE_MS = 40;
const INTENT_TTL_MS = 1_000;
const WAIT_GRACE_MS = 1_500;

function secureId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }
    // Coordination identity is not authentication authority. Keep the fallback
    // deterministic enough for old WebViews without weakening token generation.
    return `${Date.now()}-${performance.now().toString(36)}`;
}

function getTabId(): string {
    const current = sessionStorage.getItem(TAB_ID_KEY);
    if (current) return current;
    const created = secureId();
    sessionStorage.setItem(TAB_ID_KEY, created);
    return created;
}

function readLease(): RefreshLease | null {
    try {
        const raw = localStorage.getItem(LOCK_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<RefreshLease>;
        if (!value.owner || !value.cycleId || !Number.isFinite(value.expiresAt)) return null;
        return {
            owner: String(value.owner),
            cycleId: String(value.cycleId),
            expiresAt: Number(value.expiresAt)
        };
    } catch {
        return null;
    }
}

function writeLease(lease: RefreshLease): void {
    localStorage.setItem(LOCK_KEY, JSON.stringify(lease));
}

function sameLease(left: RefreshLease | null, right: RefreshLease): boolean {
    return Boolean(
        left &&
        left.owner === right.owner &&
        left.cycleId === right.cycleId
    );
}

function removeLeaseIfOwned(lease: RefreshLease): void {
    const current = readLease();
    if (sameLease(current, lease)) {
        localStorage.removeItem(LOCK_KEY);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface RefreshIntent {
    owner: string;
    createdAt: number;
    expiresAt: number;
}

function intentKey(tabId: string): string {
    return `${INTENT_PREFIX}${tabId}`;
}

function removeIntent(tabId: string): void {
    try {
        localStorage.removeItem(intentKey(tabId));
    } catch {
        // Coordination metadata cleanup is best effort only.
    }
}

function readActiveIntents(now = Date.now()): RefreshIntent[] {
    const intents: RefreshIntent[] = [];
    const staleKeys: string[] = [];
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(INTENT_PREFIX)) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const value = JSON.parse(raw) as Partial<RefreshIntent>;
                const intent: RefreshIntent = {
                    owner: String(value.owner || ""),
                    createdAt: Number(value.createdAt),
                    expiresAt: Number(value.expiresAt)
                };
                if (!intent.owner || !Number.isFinite(intent.createdAt) || !Number.isFinite(intent.expiresAt)) {
                    staleKeys.push(key);
                    continue;
                }
                if (intent.expiresAt <= now) {
                    staleKeys.push(key);
                    continue;
                }
                intents.push(intent);
            } catch {
                staleKeys.push(key);
            }
        }
        for (const key of staleKeys) localStorage.removeItem(key);
    } catch {
        // If storage enumeration fails, caller will fail closed rather than
        // intentionally weaken backend one-time rotation.
        return [];
    }
    return intents.sort((left, right) =>
        left.createdAt - right.createdAt || left.owner.localeCompare(right.owner)
    );
}

async function tryAcquireStorageLease(tabId: string): Promise<RefreshLease | null> {
    const now = Date.now();
    const existing = readLease();
    if (existing && existing.expiresAt > now && existing.owner !== tabId) {
        return null;
    }

    // localStorage has no compare-and-swap. Do not let competing tabs overwrite
    // the singleton lease directly. Each contender first publishes a unique,
    // short-lived intent and a deterministic election chooses exactly one writer.
    const intent: RefreshIntent = {
        owner: tabId,
        createdAt: now,
        expiresAt: now + INTENT_TTL_MS
    };
    try {
        localStorage.setItem(intentKey(tabId), JSON.stringify(intent));
    } catch {
        return null;
    }

    await delay(LOCK_SETTLE_MS);
    const afterSettle = readLease();
    if (afterSettle && afterSettle.expiresAt > Date.now() && afterSettle.owner !== tabId) {
        removeIntent(tabId);
        return null;
    }

    const contenders = readActiveIntents();
    const winner = contenders[0];
    if (!winner || winner.owner !== tabId) {
        removeIntent(tabId);
        return null;
    }

    const candidate: RefreshLease = {
        owner: tabId,
        cycleId: secureId(),
        expiresAt: Date.now() + LOCK_TTL_MS
    };
    writeLease(candidate);
    const verified = readLease();
    removeIntent(tabId);
    return sameLease(verified, candidate) ? candidate : null;
}

interface WebLockManagerLike {
    request<T>(
        name: string,
        options: { mode: "exclusive"; ifAvailable: true },
        callback: (lock: unknown | null) => Promise<T>
    ): Promise<T>;
}

function getWebLockManager(): WebLockManagerLike | null {
    if (typeof navigator === "undefined") return null;
    const manager = (navigator as Navigator & { locks?: WebLockManagerLike }).locks;
    return manager && typeof manager.request === "function" ? manager : null;
}

async function tryRunWithWebLock(
    tabId: string,
    operation: () => Promise<CoordinatedRefreshSuccess>,
    classifyFailure: (error: unknown) => CoordinatedRefreshFailure
): Promise<CoordinatedRefreshSuccess | null> {
    const manager = getWebLockManager();
    if (!manager) return null;

    return manager.request(LOCK_KEY, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) return null;
        const lease: RefreshLease = {
            owner: tabId,
            cycleId: secureId(),
            expiresAt: Date.now() + LOCK_TTL_MS
        };
        writeLease(lease);
        return runLeader(lease, tabId, operation, classifyFailure);
    });
}

function publishSignal(signal: RefreshSignal, channel: BroadcastChannel | null): void {
    if (channel) {
        channel.postMessage(signal);
    }

    // Storage is only a compatibility signal bus. Never persist refresh tokens
    // or access tokens here. BroadcastChannel carries the access token in-memory
    // so modern same-origin tabs can retry without an extra refresh rotation.
    const storageSignal: RefreshSignal = signal.type === "AUTH_REFRESH_SUCCESS"
        ? { ...signal, accessToken: undefined }
        : signal;
    try {
        localStorage.setItem(SIGNAL_KEY, JSON.stringify(storageSignal));
        localStorage.removeItem(SIGNAL_KEY);
    } catch {
        // BroadcastChannel may still be available. Coordination failure falls
        // back to lease expiry rather than weakening backend token rotation.
    }
}

function isBroadcastChannelAvailable(): boolean {
    return typeof BroadcastChannel !== "undefined";
}

function createChannel(): BroadcastChannel | null {
    return isBroadcastChannelAvailable() ? new BroadcastChannel(CHANNEL_NAME) : null;
}

function startHeartbeat(lease: RefreshLease): number {
    return window.setInterval(() => {
        const current = readLease();
        if (!sameLease(current, lease)) return;
        lease.expiresAt = Date.now() + LOCK_TTL_MS;
        writeLease(lease);
    }, LOCK_HEARTBEAT_MS);
}

function waitForCycleResult(
    cycleId: string,
    maxWaitMs: number
): Promise<RefreshSignal | null> {
    return new Promise((resolve) => {
        let done = false;
        const channel = createChannel();

        const finish = (signal: RefreshSignal | null) => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            channel?.close();
            window.removeEventListener("storage", onStorage);
            resolve(signal);
        };

        const accept = (candidate: unknown) => {
            const signal = candidate as RefreshSignal | null;
            if (!signal || !("cycleId" in signal) || signal.cycleId !== cycleId) return;
            if (signal.type === "AUTH_REFRESH_SUCCESS" || signal.type === "AUTH_REFRESH_FAILED") {
                finish(signal);
            }
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key !== SIGNAL_KEY || !event.newValue) return;
            try {
                accept(JSON.parse(event.newValue));
            } catch {
                // Ignore malformed coordination metadata.
            }
        };

        if (channel) channel.onmessage = (event: MessageEvent<RefreshSignal>) => accept(event.data);
        window.addEventListener("storage", onStorage);
        const timer = window.setTimeout(() => finish(null), maxWaitMs);
    });
}

async function runLeader(
    lease: RefreshLease,
    tabId: string,
    operation: () => Promise<CoordinatedRefreshSuccess>,
    classifyFailure: (error: unknown) => CoordinatedRefreshFailure
): Promise<CoordinatedRefreshSuccess> {
    const channel = createChannel();
    const heartbeat = startHeartbeat(lease);
    try {
        const result = await operation();
        publishSignal({
            type: "AUTH_REFRESH_SUCCESS",
            tabId,
            cycleId: lease.cycleId,
            at: Date.now(),
            accessToken: result.accessToken,
            user: result.user
        }, channel);
        return result;
    } catch (error) {
        publishSignal({
            type: "AUTH_REFRESH_FAILED",
            tabId,
            cycleId: lease.cycleId,
            at: Date.now(),
            failure: classifyFailure(error)
        }, channel);
        throw error;
    } finally {
        window.clearInterval(heartbeat);
        removeLeaseIfOwned(lease);
        channel?.close();
    }
}

export class CrossTabRefreshFailure extends Error {
    readonly failure: CoordinatedRefreshFailure;

    constructor(failure: CoordinatedRefreshFailure) {
        super(failure.message || failure.code || "Cross-tab refresh failed");
        this.name = "CrossTabRefreshFailure";
        this.failure = failure;
    }
}

export async function coordinateBrowserRefresh(
    operation: () => Promise<CoordinatedRefreshSuccess>,
    classifyFailure: (error: unknown) => CoordinatedRefreshFailure
): Promise<CoordinatedRefreshSuccess> {
    const tabId = getTabId();
    const intentChannel = createChannel();
    publishSignal({ type: "AUTH_REFRESH_INTENT", tabId, at: Date.now() }, intentChannel);
    intentChannel?.close();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const webLockManager = getWebLockManager();
        if (webLockManager) {
            const webLockResult = await tryRunWithWebLock(tabId, operation, classifyFailure);
            if (webLockResult) return webLockResult;
        } else {
            const lease = await tryAcquireStorageLease(tabId);
            if (lease) {
                return runLeader(lease, tabId, operation, classifyFailure);
            }
        }

        const current = readLease();
        if (!current || current.expiresAt <= Date.now()) {
            await delay(LOCK_SETTLE_MS);
            continue;
        }

        const signal = await waitForCycleResult(
            current.cycleId,
            Math.max(LOCK_TTL_MS, current.expiresAt - Date.now()) + WAIT_GRACE_MS
        );

        if (signal?.type === "AUTH_REFRESH_FAILED") {
            throw new CrossTabRefreshFailure(signal.failure);
        }

        if (signal?.type === "AUTH_REFRESH_SUCCESS" && signal.accessToken) {
            return {
                accessToken: signal.accessToken,
                user: signal.user
            };
        }

        // Storage-event fallback intentionally carries no access token. Once
        // the previous lease is gone this tab may safely perform the next
        // sequential rotation using the browser's already-updated HttpOnly
        // cookie. This favors safety over exact-one-refresh on old browsers.
        await delay(LOCK_SETTLE_MS);
    }

    throw new Error("Không thể giành quyền làm mới phiên sau khi khóa tab hết hạn.");
}

export function getRefreshCoordinationContract() {
    return {
        channelName: CHANNEL_NAME,
        lockKey: LOCK_KEY,
        signalKey: SIGNAL_KEY,
        lockTtlMs: LOCK_TTL_MS,
        heartbeatMs: LOCK_HEARTBEAT_MS,
        broadcastChannel: isBroadcastChannelAvailable(),
        webLocks: Boolean(getWebLockManager()),
        intentPrefix: INTENT_PREFIX
    };
}
