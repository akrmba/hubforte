import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface SurveyMeta {
  studentFirstName: string;
  programmeType: string;
  timePoint: "pre" | "end" | "forward_to_future";
  alreadySubmitted: boolean;
  tokenType: "student_survey" | "parent_survey";
}

// ─── Student survey question definitions ─────────────────────────────────────

const LIKERT_OPTIONS = [
  "Strongly agree",
  "Agree",
  "Neither agree nor disagree",
  "Disagree",
  "Strongly disagree",
];

interface Question {
  key: string;
  text: string;
  type: "likert" | "text";
}

const STUDENT_QUESTIONS: Question[] = [
  { key: "enjoyedProgramme",    text: "I enjoyed the programme.",                                    type: "likert" },
  { key: "preparedFuture",      text: "The programme has helped me feel more prepared for my future.", type: "likert" },
  { key: "motivatedSchool",     text: "The programme has motivated me at school.",                    type: "likert" },
  { key: "shownSkills",         text: "The programme has helped me show my skills.",                  type: "likert" },
  { key: "betterFutureIdeas",   text: "I have better ideas about my future because of the programme.", type: "likert" },
  { key: "positiveDifference",  text: "The programme made a positive difference to me.",              type: "likert" },
  { key: "threeWords",          text: "Describe the programme in three words.",                       type: "text"   },
  { key: "favouriteThing",      text: "What was your favourite thing about the programme?",           type: "text"   },
  { key: "whyFavourite",        text: "Why was that your favourite thing?",                           type: "text"   },
  { key: "changeOneThing",      text: "If you could change one thing about the programme, what would it be?", type: "text" },
  { key: "otherComments",       text: "Any other comments?",                                          type: "text"   },
];

const PARENT_QUESTIONS: Question[] = [
  { key: "positiveDifferenceChild", text: "The programme made a positive difference to my child.",       type: "likert" },
  { key: "childMorePrepared",       text: "My child feels more prepared for their future.",              type: "likert" },
  { key: "childMoreMotivated",      text: "My child is more motivated at school.",                       type: "likert" },
  { key: "biggestChanges",          text: "What are the biggest changes you have noticed in your child?", type: "text"  },
];

/**
 * Public student/parent survey form — /survey
 * Session-cookie authenticated (set during /enter token exchange).
 * One question at a time, large tap targets, mobile-first.
 */
export function SurveyPage() {
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = welcome screen
  const [status, setStatus] = useState<"loading" | "active" | "review" | "submitted" | "already_submitted" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api.get<SurveyMeta>("/api/lms/public/survey")
      .then((data) => {
        setMeta(data);
        setStatus(data.alreadySubmitted ? "already_submitted" : "active");
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err.message || "Could not load survey. Your session may have expired.");
      });
  }, []);

  const questions = meta?.tokenType === "parent_survey" ? PARENT_QUESTIONS : STUDENT_QUESTIONS;

  function setAnswer(key: string, value: string | boolean) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function next() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setStatus("review");
    }
  }

  async function submit() {
    if (!meta) return;
    try {
      const payload: Record<string, unknown> = {
        timePoint: meta.timePoint,
        submissionChannel: "coach_handover" as const,
        ...answers,
      };
      await api.post("/api/lms/public/survey/submit", payload);
      setStatus("submitted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setErrorMsg(msg);
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <p className="text-gray-500">Loading survey...</p>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-xl font-bold mb-2">Oops</h1>
          <p className="text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ─── Already submitted ──────────────────────────────────────────────────────
  if (status === "already_submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Already submitted</h1>
          <p className="text-gray-600">You've already completed this survey. Thank you!</p>
        </div>
      </div>
    );
  }

  // ─── Submitted ──────────────────────────────────────────────────────────────
  if (status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-gray-600 mb-6">Your responses have been saved.</p>
          <button
            onClick={async () => {
              // Clear the lms_session cookie so the coach's device doesn't retain student session state
              await api.post("/api/lms/public/logout").catch(() => {});
              window.location.href = "/my-students";
            }}
            className="px-8 py-3 bg-[var(--color-deep-navy)] text-white rounded-lg font-medium text-lg hover:opacity-90 transition-opacity"
          >
            Return to Coach
          </button>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  // ─── Welcome screen ─────────────────────────────────────────────────────────
  if (currentIndex === -1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-cream)]">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-2">
            Hi {meta.studentFirstName}!
          </h1>
          <p className="text-gray-600 mb-6">
            We'd love to hear about your experience on the programme.
            This should take about 5 minutes.
          </p>
          <button
            onClick={() => setCurrentIndex(0)}
            className="px-8 py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium text-lg hover:opacity-90 transition-opacity"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // ─── Review screen ──────────────────────────────────────────────────────────
  if (status === "review") {
    return (
      <div className="min-h-screen bg-[var(--color-cream)] p-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold mb-4">Review your answers</h1>
          <div className="grid gap-3 mb-6">
            {questions.map((q, i) => (
              <div key={q.key} className="bg-white p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">{q.text}</p>
                <p className="text-sm font-medium">{String(answers[q.key] ?? "—")}</p>
                <button
                  onClick={() => { setCurrentIndex(i); setStatus("active"); }}
                  className="text-xs text-[var(--color-warm-gold)] mt-1"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            className="w-full py-3 bg-[var(--color-deep-navy)] text-white rounded-lg font-medium text-lg hover:opacity-90 transition-opacity"
          >
            Submit
          </button>
          {errorMsg && <p className="text-red-500 text-sm mt-2 text-center">{errorMsg}</p>}
        </div>
      </div>
    );
  }

  // ─── Question screen ─────────────────────────────────────────────────────────
  const question = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-[var(--color-cream)] p-6">
      <div className="max-w-md mx-auto">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-[var(--color-warm-gold)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-gray-400 mb-2">
          Question {currentIndex + 1} of {questions.length}
        </p>

        <h2 className="text-lg font-semibold mb-6">{question.text}</h2>

        {question.type === "likert" ? (
          <div className="grid gap-2">
            {LIKERT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => { setAnswer(question.key, opt); next(); }}
                className={`w-full py-3 px-4 rounded-lg text-left text-sm font-medium border-2 transition-all ${
                  answers[question.key] === opt
                    ? "bg-[var(--color-warm-gold)]/10 border-[var(--color-warm-gold)] text-[var(--color-warm-gold)]"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <textarea
              value={(answers[question.key] as string) ?? ""}
              onChange={(e) => setAnswer(question.key, e.target.value)}
              rows={4}
              placeholder="Type your answer..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm resize-y min-h-[120px]"
            />
            <button
              onClick={next}
              className="mt-4 w-full py-3 bg-[var(--color-warm-gold)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              {currentIndex < questions.length - 1 ? "Next" : "Review"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
