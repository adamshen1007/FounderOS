export interface M15ScenarioBehavioralEvidence {
  readonly testFile: string;
  readonly testName: string;
}

function evidence(testFile: string, testName: string): M15ScenarioBehavioralEvidence {
  return { testFile, testName };
}

const D = "tests/durable-readiness-ledger.test.ts";
const L = "tests/local-file-readiness-ledger.test.ts";
const S = "../../packages/knowledge-schema/tests/durable-readiness-ledger.test.ts";
const P = "tests/production-provider-readiness-facade.test.ts";
const T = "tests/milestone-15-documentation-traceability.test.ts";

function scenario(
  number: number,
  title: string,
  requirements: readonly string[],
  behavioralEvidence: readonly M15ScenarioBehavioralEvidence[],
) {
  const scenarioId = `M15-SC-${String(number).padStart(3, "0")}`;
  return {
    scenarioId,
    title,
    requirements,
    behavioralEvidence,
    executableTestFile: "tests/durable-readiness-evaluation-scenarios.test.ts",
    executableTestName: `${scenarioId} — ${title}`,
  } as const;
}

const d = (name: string) => evidence(D, name);
const l = (name: string) => evidence(L, name);
const s = (name: string) => evidence(S, name);
const p = (name: string) => evidence(P, name);
const t = (name: string) => evidence(T, name);

export const M15_DURABLE_READINESS_EVALUATION_SCENARIOS = [
  scenario(
    1,
    "commits the first governed registration",
    ["M15-ARCH-001", "M15-REG-001", "M15-IDEM-001"],
    [d("commits a verified original from genesis and advances exact head coordinates")],
  ),
  scenario(
    2,
    "returns the exact original on registration retry",
    ["M15-REG-001", "M15-IDEM-001"],
    [d("runs exact registration retry and returns the original without head advancement")],
  ),
  scenario(
    3,
    "rejects changed registration idempotency ownership",
    ["M15-IDEM-001"],
    [d("permanently rejects registration idempotency-key conflicts")],
  ),
  scenario(
    4,
    "returns exact replay retry and rejects conflicting replay identity",
    ["M15-IDEM-002"],
    [
      d("returns exact replay retry without reassessment or append"),
      d("returns coordinate-specific replay ownership conflicts"),
    ],
  ),
  scenario(
    5,
    "recomputes every named commitment domain",
    ["M15-COMMIT-001", "M15-AUDIT-001"],
    [d("implements every normative commitment domain exactly once")],
  ),
  scenario(
    6,
    "records historical match and current authorization expiration",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records matched history with independently %s current authorization")],
  ),
  scenario(
    7,
    "records current authorization denial",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records original %s Authorization as %s")],
  ),
  scenario(
    8,
    "records current authorization review requirement",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records original %s Authorization as %s")],
  ),
  scenario(
    9,
    "records current authorization not-evaluated",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records original %s Authorization as %s")],
  ),
  scenario(
    10,
    "records invalid current authorization evidence",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records original %s Authorization as %s")],
  ),
  scenario(
    11,
    "binds distinct original and replay timestamps",
    ["M15-REPLAY-001"],
    [d("records matched history with independently %s current authorization")],
  ),
  scenario(
    12,
    "bounds valid package mismatch paths",
    ["M15-REPLAY-002"],
    [d("records valid canonical package inequality as mismatched with bounded paths")],
  ),
  scenario(
    13,
    "binds historical verification-failed configuration evidence",
    ["M15-REPLAY-002"],
    [d("records evaluator configuration mismatch as historical verification-failed evidence")],
  ),
  scenario(
    14,
    "binds historical verification-failed delivery authority evidence",
    ["M15-REPLAY-002"],
    [d("records %s authority mismatch as historical verification-failed evidence")],
  ),
  scenario(
    15,
    "binds historical verification-failed invocation authority evidence",
    ["M15-REPLAY-002"],
    [d("records %s authority mismatch as historical verification-failed evidence")],
  ),
  scenario(
    16,
    "does not record replay after ledger integrity failure",
    ["M15-INTEGRITY-001", "M15-REPLAY-002"],
    [d("fails closed when a marker-bounded transaction is tampered")],
  ),
  scenario(
    17,
    "does not record replay for a missing original",
    ["M15-REPLAY-002"],
    [d("returns not-recorded without append when the original transaction is missing")],
  ),
  scenario(
    18,
    "rejects replay input before evaluator access",
    ["M15-REPLAY-002", "M15-PRIVACY-001"],
    [d("rejects accessor-backed replay identity before invocation or evaluator access")],
  ),
  scenario(
    19,
    "returns not-appended after replay append failure",
    ["M15-REPLAY-002"],
    [l("recovers a complete old or new head for replay at %s")],
  ),
  scenario(
    20,
    "returns stable stale replay head conflict",
    ["M15-REPLAY-002", "M15-FS-003"],
    [d("allows at most one concurrent replay writer from one observed head")],
  ),
  scenario(
    21,
    "recovers registration at every applicable fault coordinate",
    ["M15-TXN-001", "M15-RECOVERY-001", "M15-FS-001"],
    [l("recovers a complete old or new head at matrix point %s")],
  ),
  scenario(
    22,
    "recovers replay at every applicable fault coordinate",
    ["M15-TXN-001", "M15-RECOVERY-001", "M15-FS-001"],
    [l("recovers a complete old or new head for replay at %s")],
  ),
  scenario(
    23,
    "preserves authority while cooperative lock blocks mutation",
    ["M15-FS-001"],
    [
      l("allows read-only integrity while a cooperative lock remains"),
      l("operator cleanup removes only a proven inactive writer lock"),
    ],
  ),
  scenario(
    24,
    "rebuilds deterministic exact derived lookups",
    ["M15-TXN-001", "M15-INTEGRITY-001"],
    [d("rebuilds derived state only from verified marker-bounded history")],
  ),
  scenario(
    25,
    "rebuilds derived head after authoritative commit",
    ["M15-TXN-001", "M15-RECOVERY-001"],
    [d("rebuilds derived state only from verified marker-bounded history")],
  ),
  scenario(
    26,
    "fails closed for corrupt or substituted authority",
    ["M15-AUDIT-001", "M15-INTEGRITY-001"],
    [
      d("fails closed when a marker-bounded transaction is tampered"),
      d("rejects authoritative event physical-location mutation: %s"),
    ],
  ),
  scenario(
    27,
    "rejects unknown and explicit-undefined fields",
    ["M15-ARCH-001", "M15-SCHEMA-001", "M15-PRIVACY-001"],
    [s("rejects explicit undefined before object parsing")],
  ),
  scenario(
    28,
    "rejects accessors without invocation",
    ["M15-SCHEMA-001", "M15-PRIVACY-001"],
    [s("rejects accessors without invoking them")],
  ),
  scenario(
    29,
    "rejects non-plain and executable inputs",
    ["M15-SCHEMA-001", "M15-PRIVACY-001"],
    [s("rejects symbols, non-enumerable properties, and custom prototypes")],
  ),
  scenario(
    30,
    "rejects unsafe filesystem roots and entries",
    ["M15-FS-001"],
    [
      d("rejects runtime/source overlap before mutation"),
      l("rejects a no-follow authoritative leaf substitution with a redacted result"),
    ],
  ),
  scenario(
    31,
    "redacts physical paths from errors and reports",
    ["M15-PRIVACY-001"],
    [l("does not expose physical paths in public storage errors")],
  ),
  scenario(
    32,
    "stores no prohibited or secret-like material",
    ["M15-PRIVACY-001", "M15-CRED-001"],
    [
      d("persists only the redacted transport commitment and no operation envelope"),
      s("rejects unapproved retained-evidence field %s structurally"),
    ],
  ),
  scenario(
    33,
    "proves no production network or provider path",
    ["M15-NET-001"],
    [
      p("does not invoke harness accessors and has no network, DNS, socket, or TLS dependency"),
      p("extracts every supported TypeScript import form for the dependency closure"),
    ],
  ),
  scenario(
    34,
    "proves no production credential path",
    ["M15-CRED-001"],
    [
      p("rejects nested URL, client, callback, secret, and path bypass shapes at capture"),
      p("extracts every supported TypeScript import form for the dependency closure"),
    ],
  ),
  scenario(
    35,
    "preserves the pinned predecessor regression baseline",
    ["M15-ARCH-001", "M15-REG-001", "M15-BASELINE-001"],
    [d("recomputes all 21 commitment domains across registration replay and restart")],
  ),
  scenario(
    36,
    "records matched and admissible replay",
    ["M15-REPLAY-001", "M15-REPLAY-002"],
    [d("records matched history with independently %s current authorization")],
  ),
  scenario(
    37,
    "rejects registration request ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    38,
    "rejects transaction ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    39,
    "rejects Decision ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    40,
    "rejects every stale registration binding",
    ["M15-REG-002", "M15-COMMIT-001"],
    [d("rejects a coherently re-signed transaction with substituted cross-bindings")],
  ),
  scenario(
    41,
    "rejects missing required transaction members",
    ["M15-REG-002", "M15-INTEGRITY-001"],
    [d("rejects every missing required committed-transaction member")],
  ),
  scenario(
    42,
    "rejects every gate-order permutation",
    ["M15-REG-002", "M15-INTEGRITY-001"],
    [
      d("rejects every adjacent gate-order permutation after coherent package re-signing"),
      p("stops a coherent re-signed test candidate at gate 13 before structural stop"),
    ],
  ),
  scenario(
    43,
    "rejects retained-evidence omission addition and alteration",
    ["M15-REG-002", "M15-INTEGRITY-001"],
    [
      d("rejects outer re-signing after retained upstream evidence alteration"),
      p("rejects coherent re-signed retention %s substitution"),
    ],
  ),
  scenario(
    44,
    "bypasses and rebuilds corrupt derived index",
    ["M15-INTEGRITY-002"],
    [d("bypasses and deterministically rebuilds corrupt derived state")],
  ),
  scenario(
    45,
    "reports and rebuilds missing derived index",
    ["M15-INTEGRITY-002"],
    [d("reports missing derived state separately without invalidating authority")],
  ),
  scenario(
    46,
    "fails closed for marker archive/current divergence",
    ["M15-TXN-001", "M15-TXN-002", "M15-INTEGRITY-001"],
    [
      d("fails closed when archived and current marker bytes differ"),
      d("fails closed when a marker-bounded committed archive is missing"),
      d("rejects authoritative event physical-location mutation: %s"),
      l("keeps an archived candidate invisible until current-marker replacement"),
    ],
  ),
  scenario(
    47,
    "returns exact five-ID replay retry after later head",
    ["M15-IDEM-002", "M15-REPLAY-003"],
    [d("returns exact replay retry without reassessment or append")],
  ),
  scenario(
    48,
    "detects physical substitution with redacted output",
    ["M15-FS-002", "M15-PRIVACY-002"],
    [
      l("rejects a no-follow authoritative leaf substitution with a redacted result"),
      l("rejects nested canonical directory identity substitution: %s"),
    ],
  ),
  scenario(49, "rejects invalid implementation preflight states", ["M15-BASELINE-001"], []),
  scenario(
    50,
    "lints milestone status inventory and links",
    ["M15-DOC-001"],
    [
      t("preserves the exact 13-document inventory and valid relative Markdown links"),
      t("keeps ADR-0019 Proposed and documents the candidate without publication authority"),
    ],
  ),
  scenario(
    51,
    "allows at most one concurrent replay commit",
    ["M15-REPLAY-002", "M15-FS-003"],
    [d("allows at most one concurrent replay writer from one observed head")],
  ),
  scenario(52, "preserves schema-to-engine package direction", ["M15-PKG-001"], []),
  scenario(
    53,
    "exposes no execution authority",
    ["M15-NOEXEC-001"],
    [
      p("rejects enabled or live Adapter configuration in every harness mode"),
      l("fresh replay evaluators remain transport-disabled"),
    ],
  ),
  scenario(
    54,
    "produces deterministic canonical genesis",
    ["M15-COMMIT-001", "M15-GENESIS-001"],
    [d("produces byte-identical deterministic genesis commitments")],
  ),
  scenario(
    55,
    "recovers first-create genesis interruptions",
    ["M15-GENESIS-001", "M15-RECOVERY-001", "M15-FS-001"],
    [l("classifies genesis interruption %s as no or complete authority")],
  ),
  scenario(
    56,
    "fails closed for invalid genesis material",
    ["M15-GENESIS-001", "M15-INTEGRITY-001"],
    [
      d("rejects canonical current-marker mutation: %s"),
      d("rejects invalid UTF-8 authoritative bytes without repair"),
      d("fails closed for every invalid genesis material class: %s"),
    ],
  ),
  scenario(
    57,
    "advances first registration from genesis exactly once",
    ["M15-GENESIS-001", "M15-HEAD-001", "M15-AUDIT-001"],
    [d("commits a verified original from genesis and advances exact head coordinates")],
  ),
  scenario(
    58,
    "binds byte-identical genesis archive and current marker",
    ["M15-GENESIS-001", "M15-TXN-001", "M15-TXN-002"],
    [d("initializes one complete empty authority with byte-identical marker copies")],
  ),
  scenario(
    59,
    "recomputes exact genesis registration and replay heads",
    ["M15-HEAD-001", "M15-COMMIT-001"],
    [
      d("produces byte-identical deterministic genesis commitments"),
      d("commits a verified original from genesis and advances exact head coordinates"),
      d("records matched history with independently %s current authorization"),
    ],
  ),
  scenario(
    60,
    "rejects invalid ledger-head shapes and categories",
    ["M15-HEAD-001", "M15-SCHEMA-001"],
    [
      s("rejects %s ledger-head keys"),
      s("rejects non-null genesis latest coordinates"),
      s("rejects event heads with null latest coordinates"),
    ],
  ),
  scenario(
    61,
    "rejects substituted latest head coordinates",
    ["M15-HEAD-001", "M15-INTEGRITY-001"],
    [
      d("fails closed when a marker-bounded transaction is tampered"),
      d("rejects substitution of latest authoritative head coordinate %s"),
    ],
  ),
  scenario(
    62,
    "keeps marker public and derived heads byte-identical",
    ["M15-HEAD-001", "M15-INTEGRITY-002"],
    [
      d("rebuilds derived state only from verified marker-bounded history"),
      d("records matched history with independently %s current authorization"),
    ],
  ),
  scenario(
    63,
    "preserves ownership conflicts across restart and index loss",
    ["M15-IDEM-001"],
    [
      d("returns coordinate-specific conflicts for every permanently owned original identity"),
      d("runs exact registration retry and returns the original without head advancement"),
    ],
  ),
  scenario(
    64,
    "rejects registration semantic-event ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    65,
    "rejects registration audit-entry ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    66,
    "rejects registration marker ID reuse",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    67,
    "returns coordinate-specific conflict for every original ID",
    ["M15-IDEM-001"],
    [d("returns coordinate-specific conflicts for every permanently owned original identity")],
  ),
  scenario(
    68,
    "returns key conflict for any changed original ID",
    ["M15-IDEM-001"],
    [d("permanently rejects registration idempotency-key conflicts")],
  ),
  scenario(
    69,
    "returns exact eight-coordinate registration retry after restart",
    ["M15-IDEM-001", "M15-REG-001"],
    [d("runs exact registration retry and returns the original without head advancement")],
  ),
  scenario(
    70,
    "distinguishes replay key conflict from exact retry",
    ["M15-IDEM-002", "M15-REPLAY-003"],
    [
      d("returns coordinate-specific replay ownership conflicts"),
      d("returns exact replay retry without reassessment or append"),
    ],
  ),
  scenario(
    71,
    "keeps operation envelopes and transient results non-durable",
    ["M15-PRIVACY-001", "M15-INTEGRITY-001"],
    [d("persists only the redacted transport commitment and no operation envelope")],
  ),
  scenario(
    72,
    "keeps every public result strict redacted and ephemeral",
    ["M15-PRIVACY-001", "M15-PRIVACY-002", "M15-INTEGRITY-001"],
    [
      s("keeps registration results strict and non-fingerprinted"),
      s("keeps replay append status ephemeral and non-fingerprinted"),
      s("keeps integrity and recovery results strict and non-fingerprinted"),
    ],
  ),
] as const;
