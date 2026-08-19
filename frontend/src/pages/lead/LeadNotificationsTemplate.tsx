import { Bell } from "lucide-react";
﻿import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadNotificationsTemplate() {
 const Icon=Bell;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="ThÃ´ng bÃ¡o" description="Theo dÃµi thÃ´ng bÃ¡o vÃ  viá»‡c cáº§n chÃº Ã½."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vá»±c thÃ´ng bÃ¡o</div><div className="text-sm text-muted-foreground">UI Poketto Ä‘Ã£ sáºµn sÃ ng; dá»¯ liá»‡u sáº½ dÃ¹ng service/API KTC hiá»‡n táº¡i.</div></div></div></div></LeadPageFrame> </section>;
}




