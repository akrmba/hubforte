import { useState } from "react";
import { Sparkles, X, Loader2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQuery } from "@tanstack/react-query";

export function AiNavHelper() {
  const { isModuleEnabled } = useFeatureFlags();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: aiConfig } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api.get<any>("/settings/ai"),
    staleTime: 5 * 60 * 1000,
  });

  if (!isModuleEnabled("ai")) return null;
  if (aiConfig?.configured && aiConfig?.features?.navHelper === false) return null;

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await api.post<any>("/ai/nav-helper", { question: question.trim() });
      if (res.success && res.answer) {
        setAnswer(res.answer);
      } else if (res.error?.includes("Daily AI navigation limit")) {
        toast({ title: "Daily limit reached", description: res.error, variant: "destructive" });
        setOpen(false);
      } else {
        setAnswer(res.error || "AI is temporarily unavailable. Use the sidebar to navigate.");
      }
    } catch {
      setAnswer("AI is temporarily unavailable. Use the sidebar to navigate.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAsk();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-72 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-500" />Navigation Help
            </span>
            <button onClick={() => { setOpen(false); setAnswer(null); setQuestion(""); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Where do I find reports?"
            className="text-sm"
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Asking...</> : "Ask"}
          </Button>
          {answer && (
            <p className="text-sm text-gray-700 bg-purple-50 border border-purple-100 rounded-lg p-3 leading-relaxed">
              {answer}
            </p>
          )}
          <p className="text-[10px] text-gray-400 text-center">Navigation help only · 10 requests/day</p>
        </div>
      )}
      <Button
        size="icon"
        onClick={() => { setOpen(o => !o); setAnswer(null); }}
        className="h-12 w-12 rounded-full bg-purple-600 hover:bg-purple-700 shadow-lg"
        title="AI Navigation Helper"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
      </Button>
    </div>
  );
}
