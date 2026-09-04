type TextNode = Text;

function normalizeCapacityText(value: string): string {
  let next = value;

  next = next.replace(
    /Mỗi tài khoản quản lý được tạo tối đa 3 tổ trưởng\.?/gi,
    "Không giới hạn số lượng tổ trưởng.",
  );
  next = next.replace(
    /Mỗi công đoạn chỉ có tối đa 1 Quản lý\.?/gi,
    "Không giới hạn số lượng Quản lý theo công đoạn.",
  );
  next = next.replace(
    /Mỗi công đoạn tối đa 1 Quản lý\.?/gi,
    "Không giới hạn số lượng Quản lý theo công đoạn.",
  );
  next = next.replace(
    /Mỗi công đoạn tối đa 3 tổ trưởng\.?/gi,
    "Không giới hạn số lượng tổ trưởng theo công đoạn.",
  );
  next = next.replace(
    /Mỗi công đoạn đã đủ 3 tổ trưởng\.?/gi,
    "Không giới hạn số lượng tổ trưởng theo công đoạn.",
  );
  next = next.replace(/(Tổ trưởng của bạn \(\d+)\/3(\))/g, "$1$2");
  next = next.replace(/(Tổ trưởng \(\d+)\/3(\))/g, "$1$2");

  // React may render the literal "/ 3" as a separate text node in the KPI.
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

if (document.body) {
  patchDocument(document.body);

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
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
