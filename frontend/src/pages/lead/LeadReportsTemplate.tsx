import { ClipboardCheck } from "lucide-react";
﻿import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadReportsTemplate() {
 const Icon=ClipboardCheck;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="BÃ¡o cÃ¡o sáº£n xuáº¥t" description="Theo dÃµi bÃ¡o cÃ¡o theo ca vÃ  tráº¡ng thÃ¡i xá»­ lÃ½."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vá»±c bÃ¡o cÃ¡o sáº£n xuáº¥t</div><div className="text-sm text-muted-foreground">UI Poketto Ä‘Ã£ sáºµn sÃ ng; dá»¯ liá»‡u sáº½ dÃ¹ng service/API KTC hiá»‡n táº¡i.</div></div></div></div></LeadPageFrame> </section>;
}




