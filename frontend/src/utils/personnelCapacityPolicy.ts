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

  // Các KPI cũ hiển thị dạng "3 / 3" hoặc "3/3". Giờ chỉ hiển thị số lượng thực tế.
  next = next.replace(/(Tổ trưởng của bạn\s*\(\d+)\s*\/\s*3(\))/g, "$1$2");
  next = next.replace(/(Tổ trưởng\s*\(\d+)\s*\/\s*3(\))/g, "$1$2");
  next = next.replace(/(\d+)\s*\/\s*3\b/g, "$1");

  // Bỏ nhãn cũ "Đã tạo tối đa" khỏi thẻ thống kê.
  next = next.replace(/Đã tạo tối đa/gi, "");

  // React có thể render literal "/ 3" thành một text node riêng trong KPI.
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
