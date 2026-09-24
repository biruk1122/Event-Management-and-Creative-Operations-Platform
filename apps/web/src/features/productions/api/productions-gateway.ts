import type { components, operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";

import type { ProductionValues } from "../components/production-form";
import {
  ProductionMutationError,
  ProductionRequestError,
} from "../lib/production-errors";
import type { Production, ProductionStatus } from "../lib/production-types";

export {
  ProductionMutationError,
  ProductionRequestError,
} from "../lib/production-errors";

export type PaginatedProductions =
  components["schemas"]["PaginatedProductionsResponse"];
export type ProductionPerson = components["schemas"]["ProductionPerson"];
export type ProductionTeam = components["schemas"]["ProductionTeam"];
export type ProductionTalent = components["schemas"]["ProductionTalentPerson"];

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function iso(day: string): string | null {
  return day ? `${day}T00:00:00.000Z` : null;
}

function createBody(values: ProductionValues) {
  return {
    name: values.name.trim(),
    productionType: values.productionType.trim(),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(iso(values.startAt) ? { startAt: iso(values.startAt)! } : {}),
    ...(iso(values.endAt) ? { endAt: iso(values.endAt)! } : {}),
    ...(iso(values.deadlineAt) ? { deadlineAt: iso(values.deadlineAt)! } : {}),
  };
}

function updateBody(values: ProductionValues) {
  return {
    name: values.name.trim(),
    productionType: values.productionType.trim(),
    description: values.description.trim() || null,
    startAt: iso(values.startAt),
    endAt: iso(values.endAt),
    deadlineAt: iso(values.deadlineAt),
  };
}

function required<T>({
  data,
  error,
  response,
}: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (data !== undefined) return data;
  throw new ProductionMutationError(response.status, error);
}

export interface ListProductionsParams {
  status?: ProductionStatus | null;
  search?: string | null;
  page: number;
  pageSize: number;
}

type ListQuery = NonNullable<
  operations["Productions_list_v1"]["parameters"]["query"]
>;

export async function listProductions(
  params: ListProductionsParams,
  signal?: AbortSignal,
): Promise<PaginatedProductions> {
  const query: Record<string, string | number> = {
    page: params.page,
    pageSize: params.pageSize,
  };
  if (params.status) query.status = params.status;
  if (params.search?.trim()) query.search = params.search.trim();
  const { data, response } = await browserApi.GET("/api/v1/productions", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProductionRequestError(response.status);
  return data;
}

export async function getProduction(
  id: string,
  signal?: AbortSignal,
): Promise<Production> {
  const { data, response } = await browserApi.GET("/api/v1/productions/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProductionRequestError(response.status);
  return data;
}

export async function listProductionPeople(
  signal?: AbortSignal,
): Promise<ProductionPerson[]> {
  const { data, response } = await browserApi.GET("/api/v1/users", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProductionRequestError(response.status);
  return data.items.map(({ id, email, firstName, lastName }) => ({
    id,
    email,
    firstName,
    lastName,
  }));
}

export async function listProductionTeams(
  signal?: AbortSignal,
): Promise<ProductionTeam[]> {
  const { data, response } = await browserApi.GET("/api/v1/teams", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProductionRequestError(response.status);
  return data.items.map(({ id, name }) => ({ id, name }));
}

export async function listProductionTalents(
  signal?: AbortSignal,
): Promise<ProductionTalent[]> {
  const { data, response } = await browserApi.GET("/api/v1/talents", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new ProductionRequestError(response.status);
  return data.items.map(({ id, fullName, type }) => ({ id, fullName, type }));
}

export async function createProduction(
  values: ProductionValues,
): Promise<Production> {
  return required(
    await browserApi.POST("/api/v1/productions", {
      body: createBody(values),
      headers: headers(),
    }),
  );
}
export async function updateProduction(
  id: string,
  values: ProductionValues,
): Promise<Production> {
  return required(
    await browserApi.PATCH("/api/v1/productions/{id}", {
      params: { path: { id } },
      body: updateBody(values),
      headers: headers(),
    }),
  );
}
export async function transitionProduction(
  id: string,
  status: ProductionStatus,
): Promise<Production> {
  return required(
    await browserApi.POST("/api/v1/productions/{id}/transition", {
      params: { path: { id } },
      body: { status },
      headers: headers(),
    }),
  );
}
export async function assignProductionManager(
  id: string,
  managerId: string | null,
): Promise<Production> {
  return required(
    await browserApi.PUT("/api/v1/productions/{id}/manager", {
      params: { path: { id } },
      body: { managerId },
      headers: headers(),
    }),
  );
}
export async function assignProductionTeam(
  id: string,
  teamId: string,
): Promise<Production> {
  return required(
    await browserApi.PUT("/api/v1/productions/{id}/teams/{teamId}", {
      params: { path: { id, teamId } },
      headers: headers(),
    }),
  );
}
export async function removeProductionTeam(
  id: string,
  teamId: string,
): Promise<Production> {
  return required(
    await browserApi.DELETE("/api/v1/productions/{id}/teams/{teamId}", {
      params: { path: { id, teamId } },
      headers: headers(),
    }),
  );
}
export async function addProductionMember(
  id: string,
  userId: string,
): Promise<Production> {
  return required(
    await browserApi.PUT("/api/v1/productions/{id}/participants/{userId}", {
      params: { path: { id, userId } },
      headers: headers(),
    }),
  );
}
export async function removeProductionMember(
  id: string,
  userId: string,
): Promise<Production> {
  return required(
    await browserApi.DELETE("/api/v1/productions/{id}/participants/{userId}", {
      params: { path: { id, userId } },
      headers: headers(),
    }),
  );
}
export async function assignProductionTalent(
  id: string,
  talentId: string,
  role: string,
): Promise<Production> {
  return required(
    await browserApi.PUT("/api/v1/productions/{id}/talents/{talentId}", {
      params: { path: { id, talentId } },
      body: { role },
      headers: headers(),
    }),
  );
}
export async function removeProductionTalent(
  id: string,
  talentId: string,
): Promise<Production> {
  return required(
    await browserApi.DELETE("/api/v1/productions/{id}/talents/{talentId}", {
      params: { path: { id, talentId } },
      headers: headers(),
    }),
  );
}
export async function deleteProduction(id: string): Promise<void> {
  const { error, response } = await browserApi.DELETE(
    "/api/v1/productions/{id}",
    {
      params: { path: { id } },
      headers: headers(),
    },
  );
  if (!response.ok) throw new ProductionMutationError(response.status, error);
}
