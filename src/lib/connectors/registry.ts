import "server-only";
import type { DataSourceConnector } from "./types";
import { makeDemoConnector } from "./demo";

// Demo build: the Companies House, UK planning (PlanIt) and US permits
// (Socrata) connectors are replaced by sample-data connectors with the
// same keys, so existing data sources and fetch history keep working.
export const connectorRegistry: Record<string, DataSourceConnector> = {
  companies_house: makeDemoConnector("companies_house", "UK", "legitimate_interest", "https://find-and-update.company-information.service.gov.uk"),
  uk_planning_planit: makeDemoConnector("uk_planning_planit", "UK", "legitimate_interest", "https://www.planit.org.uk"),
  us_permits_socrata: makeDemoConnector("us_permits_socrata", "US", "legitimate_interest", "https://data.austintexas.gov"),
};

export function getConnector(key: string): DataSourceConnector | undefined {
  return connectorRegistry[key];
}
