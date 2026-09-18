import { describe, expect, it } from "vitest";
import { normalizeQuestionAnswer, scoreQuestions, validateAnswerSemantics } from "./ux-audit-scoring.ts";

describe("UX audit scoring policy", () => {
  it("scores pass as 1, partial as 0.5, and every other state as 0", () => {
    const result = scoreQuestions([
      { id: "1", answer_state: "pass" },
      { id: "2", answer_state: "partial" },
      { id: "3", answer_state: "fail" },
      { id: "4", answer_state: "not_tested" },
      { id: "5", answer_state: "n_a" },
    ]);

    expect(result.total_marks).toBe(1.5);
    expect(result.max_marks).toBe(5);
    expect(result.score).toBe(30);
  });

  it("does not allow an insufficient-evidence answer to remain a pass", () => {
    const question = validateAnswerSemantics(normalizeQuestionAnswer({
      id: "1",
      answer_state: "pass",
      answer_status: "insufficient_evidence",
      mark: 1,
    }));
    const result = scoreQuestions([question]);

    expect(result.score).toBe(0);
    expect(question.answer_state).toBe("not_tested");
    expect(question.mark).toBe(0);
  });
});
