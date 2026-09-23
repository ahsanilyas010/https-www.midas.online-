import "server-only";
import type { DataSourceConnector } from "./types";
import { companiesHouseConnector } from "./companies-house";
import { ukPlanningConnector } from "./uk-planning";
import { usPermitsConnector } from "./us-permits";

export const connectorRegistry: Record<string, DataSourceConnector> = {
  [companiesHouseConnector.key]: companiesHouseConnector,
  [ukPlanningConnector.key]: ukPlanningConnector,
  [usPermitsConnector.key]: usPermitsConnector,
};

export function getConnector(key: string): DataSourceConnector | undefined {
  return connectorRegistry[key];
}
