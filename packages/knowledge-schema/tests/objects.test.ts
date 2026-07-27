import { describe, expect, it } from "vitest";

import {
  DecisionObjectSchema,
  KnowledgeObjectSchema,
  ProjectObjectSchema,
  RelationshipObjectSchema,
  parseKnowledgeObject,
} from "../src/index.js";
import { createMetadata } from "./fixtures.js";

describe("KnowledgeOS object schemas", () => {
  it("parses a general knowledge object", () => {
    const object = parseKnowledgeObject({
      metadata: createMetadata("knowledge"),
      content: "Context is the long-term moat.",
    });

    expect(object.metadata.objectType).toBe("knowledge");
  });

  it("enforces decision reasoning, expected outcome, and review date", () => {
    const decision = DecisionObjectSchema.parse({
      metadata: createMetadata("decision"),
      context: "FounderOS needs an implementation language.",
      problem: "Choose a primary language.",
      options: ["TypeScript", "Python"],
      chosenOption: "TypeScript",
      reasoning: "It supports shared contracts and strict typing.",
      expectedOutcome: "A maintainable monorepo foundation.",
      reviewDate: "2026-10-27",
    });

    expect(decision.risks).toEqual([]);
    expect(decision.lessonsLearned).toEqual([]);
  });

  it("rejects a chosen decision option that was not evaluated", () => {
    const result = DecisionObjectSchema.safeParse({
      metadata: createMetadata("decision"),
      context: "Connector selection.",
      problem: "Choose the first connector.",
      options: ["Reddit", "X"],
      chosenOption: "TikTok",
      reasoning: "Community signal quality.",
      expectedOutcome: "Validated market signals.",
      reviewDate: "2026-10-27",
    });

    expect(result.success).toBe(false);
  });

  it("rejects decisions without a review date", () => {
    const result = DecisionObjectSchema.safeParse({
      metadata: createMetadata("decision"),
      context: "Connector selection.",
      problem: "Choose the first connector.",
      options: ["Reddit", "X"],
      chosenOption: "Reddit",
      reasoning: "Community signal quality.",
      expectedOutcome: "Validated market signals.",
    });

    expect(result.success).toBe(false);
  });

  it("enforces project vision and milestones", () => {
    const project = ProjectObjectSchema.parse({
      metadata: createMetadata("project"),
      name: "FounderOS",
      vision: "A founder intelligence operating system.",
      objectives: ["Improve founder decision quality"],
      projectStatus: "building",
      milestones: ["KnowledgeOS foundation"],
    });

    expect(project.projectStatus).toBe("building");
    expect(project.milestones).toEqual(["KnowledgeOS foundation"]);
  });

  it("rejects a project without milestones", () => {
    const result = ProjectObjectSchema.safeParse({
      metadata: createMetadata("project"),
      name: "FounderOS",
      vision: "A founder intelligence operating system.",
      objectives: ["Improve founder decision quality"],
      projectStatus: "building",
      milestones: [],
    });

    expect(result.success).toBe(false);
  });

  it("models relationships as first-class objects", () => {
    const relationship = RelationshipObjectSchema.parse({
      metadata: createMetadata("relationship"),
      sourceObjectId: "research-001",
      targetObjectId: "decision-001",
      relationshipType: "supports",
      strength: "high",
      relationshipConfidence: "validated",
    });

    expect(relationship.relationshipType).toBe("supports");
  });

  it("rejects self-referential relationships", () => {
    const result = RelationshipObjectSchema.safeParse({
      metadata: createMetadata("relationship"),
      sourceObjectId: "knowledge-001",
      targetObjectId: "knowledge-001",
      relationshipType: "related_to",
      strength: "low",
      relationshipConfidence: "medium",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an object whose metadata declares the wrong object type", () => {
    const result = KnowledgeObjectSchema.safeParse({
      metadata: createMetadata("research"),
      content: "This shape belongs to a general knowledge object.",
    });

    expect(result.success).toBe(false);
  });
});
