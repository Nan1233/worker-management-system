const test = require("node:test");
const assert = require("node:assert/strict");
const {
    evaluateCompanyNetwork,
    requireCompanyNetworkForWorker
} = require("../middleware/companyNetworkMiddleware");

function request(ip, role = "worker") {
    return {
        ip,
        hostname: "worker-management-system-2-5jqv.onrender.com",
        headers: {},
        socket: {},
        originalUrl: "/api/production-temp",
        user: { id: 1, worker_id: 1, role }
    };
}

test("company public IP is allowed", () => {
    const result = evaluateCompanyNetwork(request("113.160.133.126"));
    assert.equal(result.allowed, true);
    assert.equal(result.enforced, true);
});

test("4G or another Wi-Fi IP is denied", () => {
    const result = evaluateCompanyNetwork(request("42.112.100.10"));
    assert.equal(result.allowed, false);
});

test("worker receives HTTP 403 outside company network", () => {
    const req = request("42.112.100.10");
    let statusCode;
    let body;
    const res = {
        status(code) { statusCode = code; return this; },
        json(value) { body = value; return value; }
    };
    let nextCalled = false;
    requireCompanyNetworkForWorker(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.equal(body.code, "COMPANY_WIFI_REQUIRED");
});

test("manager is not restricted", () => {
    const req = request("42.112.100.10", "manager");
    let nextCalled = false;
    requireCompanyNetworkForWorker(req, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});

test("Render proxy chain returns the first public client IP", () => {
    const req = request("10.28.112.130");
    req.headers["x-forwarded-for"] = "113.160.133.126, 10.28.112.130";
    req.ips = ["113.160.133.126", "10.28.112.130"];
    const result = evaluateCompanyNetwork(req);
    assert.equal(result.clientIp, "113.160.133.126");
    assert.equal(result.allowed, true);
});

test("Render internal proxy IP alone is never treated as company Wi-Fi", () => {
    const req = request("10.28.112.130");
    req.headers["x-forwarded-for"] = "10.28.112.130";
    const result = evaluateCompanyNetwork(req);
    assert.equal(result.allowed, false);
});

test("4G public IP in forwarded chain is denied", () => {
    const req = request("10.28.112.130");
    req.headers["x-forwarded-for"] = "42.112.100.10, 10.28.112.130";
    const result = evaluateCompanyNetwork(req);
    assert.equal(result.clientIp, "42.112.100.10");
    assert.equal(result.allowed, false);
});
