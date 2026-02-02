import type { Edge, Node } from "reactflow";

export type BriefingMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

type Params = {
  storyTitle?: string;
  exportedAt?: Date;
  nodes: Node[];
  edges: Edge[];
  messages?: BriefingMessage[];
};

function safeText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function looksLikeEmail(value: string): boolean {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
}

function looksLikePhone(value: string): boolean {
  return /(?:\+?\d[\d\s\-()]{7,}\d)/.test(value);
}

function scrubSourceRef(value: string): string {
  const v = safeText(value);
  if (!v) return "";
  if (looksLikeEmail(v)) return "[REDACTED_EMAIL]";
  if (looksLikePhone(v)) return "[REDACTED_PHONE]";
  return v;
}

function exportNodeLabel(n: Node): string {
  const type = safeText((n as any)?.type).toLowerCase();
  const d = ((n as any)?.data || {}) as any;
  const isSource = type === "source";
  if (isSource && (d?.anonymity === true || d?.protectIdentity === true)) return "REDACTED SOURCE";
  return safeText(d?.label || d?.name) || "Untitled";
}

function safeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "Story";
}

export function getExecutiveBriefingFilename(storyTitle?: string): string {
  return `Spyglass_Report_${safeFilenamePart(safeText(storyTitle) || "Story")}.md`;
}

export function generateExecutiveBriefingMarkdown({
  storyTitle,
  exportedAt,
  nodes,
  edges,
  messages,
}: Params): string {
  void edges;
  const title = safeText(storyTitle) || "Untitled Story";
  const when = exportedAt ?? new Date();
  const exportedLine = when.toLocaleString();

  const verifiedNodes = nodes.filter((n) => {
    const stamp = safeText((n.data as any)?.stamp).toLowerCase();
    return stamp === "verified";
  });

  const chronology = nodes
    .map((n) => {
      const eventDate = safeText((n.data as any)?.eventDate);
      if (!eventDate) return null;
      const label = exportNodeLabel(n);
      return { id: n.id, eventDate, label, type: safeText(n.type) };
    })
    .filter(Boolean) as Array<{ id: string; eventDate: string; label: string; type: string }>;
  chronology.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const assistantReplies = (messages || []).filter((m) => m.role === "assistant").slice(-5);

  let md = `# Executive Briefing: ${title}\n`;
  md += `Exported: ${exportedLine}\n\n`;

  md += `## Verified Evidence\n\n`;
  if (verifiedNodes.length === 0) {
    md += `No verified evidence stamped yet.\n\n`;
  } else {
    verifiedNodes.forEach((n) => {
      const label = exportNodeLabel(n);
      const sources = [
        ...(((n.data as any)?.sources as unknown[]) || []).map((s) => safeText(s)).filter(Boolean),
        safeText((n.data as any)?.source),
      ]
        .map((s) => s.trim())
        .filter(Boolean)
        .map(scrubSourceRef)
        .filter(Boolean);
      const uniqueSources = Array.from(new Set(sources));

      md += `- **${label}**\n`;
      if (uniqueSources.length > 0) {
        md += `  - Sources: ${uniqueSources.map((s) => `\`${s}\``).join(", ")}\n`;
      }
    });
    md += `\n`;
  }

  md += `## Chronology\n\n`;
  if (chronology.length === 0) {
    md += `No dated leads on the timeline.\n\n`;
  } else {
    chronology.forEach((it) => {
      const type = it.type ? ` (${it.type})` : "";
      md += `- ${it.eventDate} — **${it.label}**${type}\n`;
    });
    md += `\n`;
  }

  md += `## Editorial Insights\n\n`;
  if (assistantReplies.length === 0) {
    md += `No AI Assistant responses recorded in this session.\n`;
  } else {
    assistantReplies.forEach((m, idx) => {
      const content = safeText(m.content);
      md += `${idx + 1}. ${content}\n`;
    });
  }

  return md;
}
