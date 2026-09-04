import api from "../services/api";

type TextNode = Text;

function normalizeCapacityText(value: string): string {
  let next = value;
  next = next.replace(/Mỗi tài khoản quản lý được tạo tối đa 3 tổ trưởng\.?/gi, "Không giới hạn số lượng tổ trưởng.");
  next = next.replace(/Mỗi công đoạn chỉ có tối đa 1 Quản lý\.?/gi, "Không giới hạn số lượng Quản lý theo công đoạn.");
  next = next.replace(/Mỗi công đoạn tối đa 1 Quản lý\.?/gi, "Không giới hạn số lượng Quản lý theo công đoạn.");
  next = next.replace(/Mỗi công đoạn tối đa 3 tổ trưởng\.?/gi, "Không giới hạn số lượng tổ trưởng theo công đoạn.");
  next = next.replace(/Mỗi công đoạn đã đủ 3 tổ trưởng\.?/gi, "Không giới hạn số lượng tổ trưởng theo công đoạn.");
  next = next.replace(/(Tổ trưởng của bạn\s*\(\d+)\s*\/\s*3(\))/g, "$1$2");
  next = next.replace(/(Tổ trưởng\s*\(\d+)\s*\/\s*3(\))/g, "$1$2");
  next = next.replace(/(\d+)\s*\/\s*3\b/g, "$1");
  next = next.replace(/Đã tạo tối đa/gi, "");
  if (/^\s*\/\s*3\s*$/.test(next)) return "";
  return next;
}

function patchTextNode(node: TextNode): void {
  const current = node.nodeValue || "";
  const next = normalizeCapacityText(current);
  if (next !== current) node.nodeValue = next;
}

function patchDocument(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextNode[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current as TextNode);
    current = walker.nextNode();
  }
  nodes.forEach(patchTextNode);
}

let managerCountPromise: Promise<void> | null = null;
let managerCountRoute = "";
let managerCountFetchedAt = 0;

async function patchManagerCount(): Promise<void> {
  const label = Array.from(document.querySelectorAll("span")).find(
    (element) => element.textContent?.trim() === "Tài khoản quản lý",
  );
  if (!label) return;

  const card = label.parentElement;
  const count = card?.querySelector("b");
  if (!count) return;

  const route = window.location.hash;
  if (route !== managerCountRoute) {
    managerCountRoute = route;
    managerCountPromise = null;
    managerCountFetchedAt = 0;
  }

  if (Date.now() - managerCountFetchedAt < 15000) return;
  if (!managerCountPromise) {
    managerCountPromise = api
      .get("/users")
      .then((response) => {
        const managerCount = Number(response.data?.manager_count);
        if (Number.isFinite(managerCount)) {
          count.textContent = String(managerCount);
          managerCountFetchedAt = Date.now();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        managerCountPromise = null;
      });
  }
  await managerCountPromise;
}

if (document.body) {
  patchDocument(document.body);
  window.setTimeout(() => void patchManagerCount(), 300);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        patchTextNode(mutation.target as TextNode);
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) patchTextNode(node as TextNode);
        else if (node.nodeType === Node.ELEMENT_NODE) patchDocument(node);
      });
    }
    void patchManagerCount();
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}
