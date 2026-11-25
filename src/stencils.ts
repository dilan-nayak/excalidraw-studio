// Built-in, offline stencil library. Each stencil is a function returning Excalidraw element skeletons
// positioned around (0,0); they are converted, grouped and inserted at the viewport centre.
type Sk = Record<string, unknown>;

export interface Stencil {
  id: string;
  name: string;
  category: "Infrastructure" | "People & devices" | "UML" | "Flow" | "General";
  keywords: string;
  build: () => Sk[];
}

const INK = "#1e1e1e";
const rect = (x: number, y: number, w: number, h: number, o: Sk = {}): Sk => ({ type: "rectangle", x, y, width: w, height: h, strokeColor: INK, backgroundColor: "transparent", ...o });
const ell = (x: number, y: number, w: number, h: number, o: Sk = {}): Sk => ({ type: "ellipse", x, y, width: w, height: h, strokeColor: INK, backgroundColor: "transparent", ...o });
const dia = (x: number, y: number, w: number, h: number, o: Sk = {}): Sk => ({ type: "diamond", x, y, width: w, height: h, strokeColor: INK, backgroundColor: "transparent", ...o });
const line = (x: number, y: number, pts: [number, number][], o: Sk = {}): Sk => ({ type: "line", x, y, points: pts, strokeColor: INK, ...o });
const arrow = (x: number, y: number, dx: number, dy: number, o: Sk = {}): Sk => ({ type: "arrow", x, y, points: [[0, 0], [dx, dy]], strokeColor: INK, ...o });
const text = (x: number, y: number, t: string, size = 16, o: Sk = {}): Sk => ({ type: "text", x, y, text: t, fontSize: size, strokeColor: INK, ...o });
const round = { roundness: { type: 3 } };
const BLUE = "#a5d8ff", GREEN = "#b2f2bb", YELLOW = "#ffec99", RED = "#ffc9c9", VIOLET = "#d0bfff", GRAY = "#e9ecef", ORANGE = "#ffd8a8", TEAL = "#96f2d7";

const user = (x: number, y: number, fill = BLUE): Sk[] => [
  rect(x + 8, y + 50, 84, 56, { ...round, backgroundColor: fill, fillStyle: "solid" }),
  ell(x + 28, y, 44, 44, { backgroundColor: fill, fillStyle: "solid" }),
];

export const STENCILS: Stencil[] = [
  {
    id: "database", name: "Database", category: "Infrastructure", keywords: "db sql storage cylinder data",
    build: () => [
      ell(-60, 40, 120, 36, { backgroundColor: GREEN, fillStyle: "solid" }),
      rect(-60, 22, 120, 36, { backgroundColor: GREEN, fillStyle: "solid", strokeColor: "transparent" }),
      ell(-60, -40, 120, 36, { backgroundColor: GREEN, fillStyle: "solid" }),
      rect(-60, -22, 120, 62, { backgroundColor: GREEN, fillStyle: "solid", strokeColor: "transparent" }),
      ell(-60, -40, 120, 36, { backgroundColor: GREEN, fillStyle: "solid" }),
      line(-60, -22, [[0, 0], [0, 80]]),
      line(60, -22, [[0, 0], [0, 80]]),
    ],
  },
  {
    id: "server", name: "Server", category: "Infrastructure", keywords: "rack host machine backend",
    build: () => [0, 1, 2].flatMap((i) => [
      rect(-70, -66 + i * 46, 140, 40, { ...round, backgroundColor: GRAY, fillStyle: "solid" }),
      ell(-56, -52 + i * 46, 12, 12, { backgroundColor: i === 0 ? "#2f9e44" : "#f08c00", fillStyle: "solid", strokeColor: "transparent" }),
      line(-30, -46 + i * 46, [[0, 0], [86, 0]], { strokeColor: "#868e96" }),
    ]),
  },
  {
    id: "cloud", name: "Cloud", category: "Infrastructure", keywords: "internet aws azure saas",
    build: () => [
      ell(-70, -4, 70, 56, { backgroundColor: BLUE, fillStyle: "solid" }),
      ell(-30, -44, 76, 70, { backgroundColor: BLUE, fillStyle: "solid" }),
      ell(10, -14, 66, 60, { backgroundColor: BLUE, fillStyle: "solid" }),
      rect(-44, 8, 90, 44, { backgroundColor: BLUE, fillStyle: "solid", strokeColor: "transparent" }),
      line(-44, 52, [[0, 0], [90, 0]]),
    ],
  },
  {
    id: "api", name: "API gateway", category: "Infrastructure", keywords: "endpoint rest gateway service",
    build: () => [dia(-80, -50, 160, 100, { backgroundColor: VIOLET, fillStyle: "solid", label: { text: "API", fontSize: 22 } })],
  },
  {
    id: "loadbalancer", name: "Load balancer", category: "Infrastructure", keywords: "lb traffic distribute proxy",
    build: () => [
      dia(-70, -40, 140, 80, { backgroundColor: ORANGE, fillStyle: "solid", label: { text: "LB", fontSize: 20 } }),
      arrow(70, 0, 70, -50), arrow(70, 0, 70, 0), arrow(70, 0, 70, 50),
      rect(140, -66, 60, 32, { ...round }), rect(140, -16, 60, 32, { ...round }), rect(140, 34, 60, 32, { ...round }),
    ],
  },
  {
    id: "queue", name: "Message queue", category: "Infrastructure", keywords: "kafka rabbit mq broker events",
    build: () => [
      rect(-90, -30, 180, 60, { ...round, backgroundColor: YELLOW, fillStyle: "solid" }),
      ...[0, 1, 2].map((i) => rect(-76 + i * 48, -16, 40, 32, { backgroundColor: "#fff", fillStyle: "solid" })),
      arrow(-130, 0, 36, 0), arrow(92, 0, 36, 0),
    ],
  },
  {
    id: "firewall", name: "Firewall", category: "Infrastructure", keywords: "security wall protect",
    build: () => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) =>
      rect(-72 + c * 50 + (r % 2 ? 25 : 0) - (r % 2 ? 25 : 0), -48 + r * 34, 46, 30, { backgroundColor: r % 2 ? RED : "#ffa8a8", fillStyle: "solid" }))),
  },
  {
    id: "router", name: "Router / network", category: "Infrastructure", keywords: "switch hub topology nodes",
    build: () => [
      arrow(0, 0, 0, -70), arrow(0, 0, 0, 70), arrow(0, 0, -70, 0), arrow(0, 0, 70, 0),
      ell(-24, -24, 48, 48, { backgroundColor: TEAL, fillStyle: "solid" }),
      ell(-80, -100, 32, 32), ell(48, -100, 32, 32), ell(-80, 68, 32, 32), ell(48, 68, 32, 32),
    ],
  },
  {
    id: "storage", name: "Storage / bucket", category: "Infrastructure", keywords: "s3 files blob disk",
    build: () => [
      line(-60, -30, [[0, 0], [20, 80], [100, 80], [120, 0]]),
      ell(-60, -46, 120, 32, { backgroundColor: YELLOW, fillStyle: "solid" }),
    ],
  },
  {
    id: "user", name: "User", category: "People & devices", keywords: "person customer account",
    build: () => user(-50, -53),
  },
  {
    id: "users", name: "Team / users", category: "People & devices", keywords: "group people customers",
    build: () => [...user(-90, -50, GREEN), ...user(-10, -50, BLUE), ...user(-50, -62, VIOLET)],
  },
  {
    id: "laptop", name: "Laptop", category: "People & devices", keywords: "computer pc client",
    build: () => [
      rect(-70, -50, 140, 90, { ...round, backgroundColor: GRAY, fillStyle: "solid" }),
      rect(-58, -38, 116, 66, { backgroundColor: BLUE, fillStyle: "solid" }),
      line(-90, 40, [[0, 0], [180, 0], [160, 16], [20, 16], [0, 0]], { backgroundColor: GRAY, fillStyle: "solid" }),
    ],
  },
  {
    id: "mobile", name: "Mobile phone", category: "People & devices", keywords: "ios android phone app",
    build: () => [
      rect(-36, -70, 72, 140, { ...round, backgroundColor: GRAY, fillStyle: "solid" }),
      rect(-28, -54, 56, 98, { backgroundColor: BLUE, fillStyle: "solid" }),
      ell(-6, 50, 12, 12),
    ],
  },
  {
    id: "browser", name: "Browser window", category: "People & devices", keywords: "web page ui wireframe",
    build: () => [
      rect(-110, -70, 220, 140, { ...round, backgroundColor: "#fff", fillStyle: "solid" }),
      line(-110, -40, [[0, 0], [220, 0]]),
      ell(-98, -57, 10, 10, { backgroundColor: "#ff8787", fillStyle: "solid", strokeColor: "transparent" }),
      ell(-82, -57, 10, 10, { backgroundColor: "#ffd43b", fillStyle: "solid", strokeColor: "transparent" }),
      ell(-66, -57, 10, 10, { backgroundColor: "#69db7c", fillStyle: "solid", strokeColor: "transparent" }),
      rect(-44, -58, 140, 14, { ...round, strokeColor: "#868e96" }),
    ],
  },
  {
    id: "classbox", name: "UML class", category: "UML", keywords: "class object oop uml diagram",
    build: () => [
      rect(-90, -60, 180, 120, { backgroundColor: "#fff", fillStyle: "solid" }),
      line(-90, -22, [[0, 0], [180, 0]]), line(-90, 14, [[0, 0], [180, 0]]),
      text(-40, -54, "ClassName", 16), text(-82, -16, "+ attribute: Type", 13), text(-82, 20, "+ method(): void", 13),
    ],
  },
  {
    id: "actor", name: "UML actor", category: "UML", keywords: "use case stick figure person",
    build: () => [
      ell(-14, -64, 28, 28), line(0, -36, [[0, 0], [0, 44]]), line(-30, -22, [[0, 0], [60, 0]]),
      line(0, 8, [[0, 0], [-24, 44]]), line(0, 8, [[0, 0], [24, 44]]), text(-28, 56, "Actor", 14),
    ],
  },
  {
    id: "usecase", name: "UML use case", category: "UML", keywords: "ellipse scenario",
    build: () => [ell(-80, -36, 160, 72, { backgroundColor: GREEN, fillStyle: "solid", label: { text: "Use case", fontSize: 16 } })],
  },
  {
    id: "package", name: "UML package", category: "UML", keywords: "module namespace folder",
    build: () => [
      rect(-90, -56, 70, 24, { backgroundColor: YELLOW, fillStyle: "solid" }),
      rect(-90, -32, 180, 90, { backgroundColor: YELLOW, fillStyle: "solid", label: { text: "package", fontSize: 16 } }),
    ],
  },
  {
    id: "interface", name: "UML interface", category: "UML", keywords: "lollipop component provided",
    build: () => [ell(-14, -14, 28, 28, { backgroundColor: "#fff", fillStyle: "solid" }), line(-70, 0, [[0, 0], [56, 0]]), rect(-130, -26, 60, 52, { ...round })],
  },
  {
    id: "note", name: "Note", category: "UML", keywords: "comment annotation sticky",
    build: () => [
      line(-80, -50, [[0, 0], [130, 0], [160, 30], [160, 100], [0, 100], [0, 0]], { backgroundColor: YELLOW, fillStyle: "solid" }),
      line(50, -50, [[0, 0], [0, 30], [30, 30]]),
      text(-68, -34, "Note", 16),
    ],
  },
  {
    id: "terminator", name: "Start / End", category: "Flow", keywords: "flowchart terminal begin finish",
    build: () => [rect(-80, -28, 160, 56, { roundness: { type: 3, value: 28 }, backgroundColor: GREEN, fillStyle: "solid", label: { text: "Start", fontSize: 18 } })],
  },
  {
    id: "process", name: "Process step", category: "Flow", keywords: "flowchart action task box",
    build: () => [rect(-80, -32, 160, 64, { ...round, backgroundColor: BLUE, fillStyle: "solid", label: { text: "Process", fontSize: 18 } })],
  },
  {
    id: "decision", name: "Decision", category: "Flow", keywords: "flowchart if branch yes no",
    build: () => [dia(-80, -56, 160, 112, { backgroundColor: YELLOW, fillStyle: "solid", label: { text: "Yes / No?", fontSize: 16 } })],
  },
  {
    id: "document", name: "Document", category: "Flow", keywords: "file page report",
    build: () => [
      rect(-60, -76, 120, 140, { backgroundColor: "#fff", fillStyle: "solid" }),
      ...[0, 1, 2, 3, 4].map((i) => line(-42, -52 + i * 24, [[0, 0], [i === 4 ? 40 : 84, 0]], { strokeColor: "#868e96" })),
    ],
  },
  {
    id: "sticky", name: "Sticky note", category: "General", keywords: "post-it memo idea",
    build: () => [rect(-70, -70, 140, 140, { backgroundColor: YELLOW, fillStyle: "solid", roughness: 1, label: { text: "Idea", fontSize: 20 } })],
  },
  {
    id: "mindmap", name: "Mind-map hub", category: "General", keywords: "brainstorm topic branches",
    build: () => [
      ...[[-140, -80], [140, -80], [-140, 80], [140, 80]].flatMap(([x, y]) => [
        arrow(0, 0, x * 0.62, y * 0.62), ell(x - 50, y - 24, 100, 48, { backgroundColor: GREEN, fillStyle: "solid" }),
      ]),
      ell(-60, -34, 120, 68, { backgroundColor: VIOLET, fillStyle: "solid", label: { text: "Topic", fontSize: 20 } }),
    ],
  },
  {
    id: "kanban", name: "Kanban columns", category: "General", keywords: "board todo doing done tasks",
    build: () => ["To do", "Doing", "Done"].flatMap((t, i) => [
      rect(-170 + i * 116, -100, 108, 200, { ...round, backgroundColor: GRAY, fillStyle: "solid" }),
      text(-150 + i * 116, -90, t, 16),
      rect(-162 + i * 116, -56, 92, 40, { ...round, backgroundColor: "#fff", fillStyle: "solid" }),
    ]),
  },
  {
    id: "lock", name: "Lock / security", category: "General", keywords: "secure auth padlock",
    build: () => [
      ell(-30, -70, 60, 70),
      rect(-46, -26, 92, 70, { ...round, backgroundColor: YELLOW, fillStyle: "solid" }),
      ell(-7, -4, 14, 14, { backgroundColor: INK, fillStyle: "solid" }),
    ],
  },
];

export const STENCIL_CATEGORIES = ["Infrastructure", "People & devices", "UML", "Flow", "General"] as const;
