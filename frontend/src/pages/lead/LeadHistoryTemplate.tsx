import { History } from "lucide-react";
﻿import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadHistoryTemplate() {
 const Icon=History;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="Lá»‹ch sá»­ hoáº¡t Ä‘á»™ng" description="Xem hoáº¡t Ä‘á»™ng vÃ  bÃ¡o cÃ¡o gáº§n Ä‘Ã¢y cá»§a tá»•."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vá»±c lá»‹ch sá»­ hoáº¡t Ä‘á»™ng</div><div className="text-sm text-muted-foreground">UI Poketto Ä‘Ã£ sáºµn sÃ ng; dá»¯ liá»‡u sáº½ dÃ¹ng service/API KTC hiá»‡n táº¡i.</div></div></div></div></LeadPageFrame> </section>;
}




