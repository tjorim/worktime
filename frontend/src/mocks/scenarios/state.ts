import { syncStore } from "@/mocks/data/syncStore";
import { DEFAULT_MOCK_SCENARIO_ID, mockScenarioFixtures } from "./fixtures";
import type { MockScenarioFixture, MockScenarioId } from "./types";

const MOCK_SCENARIO_QUERY_PARAM = "mswScenario";
const MOCK_SCENARIO_PATH_PREFIX = "/__mock/";

let activeScenarioId: MockScenarioId = DEFAULT_MOCK_SCENARIO_ID;
let activeScenario: MockScenarioFixture = structuredClone(mockScenarioFixtures[DEFAULT_MOCK_SCENARIO_ID]);

function applySyncScenarioToStore(scenario: MockScenarioFixture): void {
  syncStore.status = structuredClone(scenario.sync.status);
  syncStore.pullData = structuredClone(scenario.sync.pullData);
  syncStore.pushResponse = structuredClone(scenario.sync.pushResponse);
  syncStore.statusError = scenario.sync.statusError;
  syncStore.pullError = scenario.sync.pullError;
  syncStore.pushError = scenario.sync.pushError;
  syncStore.preferences = null;
}

function parseScenarioId(value: string | null | undefined): MockScenarioId | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized in mockScenarioFixtures ? (normalized as MockScenarioId) : null;
}

function scenarioFromPath(pathname: string | undefined): MockScenarioId | null {
  if (!pathname?.startsWith(MOCK_SCENARIO_PATH_PREFIX)) return null;
  const candidate = pathname.slice(MOCK_SCENARIO_PATH_PREFIX.length).split("/")[0];
  return parseScenarioId(candidate);
}

export function listMockScenarioIds(): MockScenarioId[] {
  return Object.keys(mockScenarioFixtures) as MockScenarioId[];
}

export function setMockScenario(id: MockScenarioId): void {
  activeScenarioId = id;
  activeScenario = structuredClone(mockScenarioFixtures[id]);
  applySyncScenarioToStore(activeScenario);
}

export function getMockScenario(): MockScenarioFixture {
  return activeScenario;
}

export function getMockScenarioId(): MockScenarioId {
  return activeScenarioId;
}

export function resetMockScenario(): void {
  setMockScenario(DEFAULT_MOCK_SCENARIO_ID);
}

export function configureMockScenario(options: {
  pathname?: string;
  search?: string;
  envScenarioId?: string;
}): void {
  const fromPath = scenarioFromPath(options.pathname);
  if (fromPath) {
    setMockScenario(fromPath);
    return;
  }

  const fromQuery = parseScenarioId(
    options.search ? new URLSearchParams(options.search).get(MOCK_SCENARIO_QUERY_PARAM) : null,
  );
  if (fromQuery) {
    setMockScenario(fromQuery);
    return;
  }

  const fromEnv = parseScenarioId(options.envScenarioId);
  if (fromEnv) {
    setMockScenario(fromEnv);
    return;
  }

  resetMockScenario();
}

export async function withMockScenario<T>(
  id: MockScenarioId,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous = getMockScenarioId();
  setMockScenario(id);
  try {
    return await run();
  } finally {
    setMockScenario(previous);
  }
}

resetMockScenario();
