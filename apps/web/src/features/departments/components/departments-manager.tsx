"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assignDepartmentManager as defaultAssignManager } from "../api/assign-department-manager";
import { createDepartment as defaultCreateDepartment } from "../api/create-department";
import { deactivateDepartment as defaultDeactivateDepartment } from "../api/deactivate-department";
import { deleteDepartment as defaultDeleteDepartment } from "../api/delete-department";
import { getDepartment as defaultGetDepartment } from "../api/get-department";
import { reactivateDepartment as defaultReactivateDepartment } from "../api/reactivate-department";
import { updateDepartment as defaultUpdateDepartment } from "../api/update-department";
import { CreateDepartmentDialog } from "./create-department-dialog";
import { DepartmentDetailDialog } from "./department-detail-dialog";
import { DepartmentFilters } from "./department-filters";
import { DepartmentsTable } from "./departments-table";
import type {
  AssignManager,
  CreateDepartment,
  DeactivateDepartment,
  DeleteDepartment,
  GetDepartment,
  ReactivateDepartment,
  UpdateDepartment,
} from "../lib/departments-outcome";
import {
  activityOf,
  personName,
  type AssignableUser,
  type Department,
  type DepartmentActivity,
  type PaginatedDepartments,
} from "../lib/departments-types";

const PAGE_SIZE = 10;

interface DepartmentsManagerProps {
  initialPage: PaginatedDepartments;
  managers: readonly AssignableUser[];
  createDepartment?: CreateDepartment;
  updateDepartment?: UpdateDepartment;
  assignManager?: AssignManager;
  deactivateDepartment?: DeactivateDepartment;
  reactivateDepartment?: ReactivateDepartment;
  deleteDepartment?: DeleteDepartment;
  getDepartment?: GetDepartment;
}

export function DepartmentsManager({
  initialPage,
  managers,
  createDepartment = defaultCreateDepartment,
  updateDepartment = defaultUpdateDepartment,
  assignManager = defaultAssignManager,
  deactivateDepartment = defaultDeactivateDepartment,
  reactivateDepartment = defaultReactivateDepartment,
  deleteDepartment = defaultDeleteDepartment,
  getDepartment = defaultGetDepartment,
}: DepartmentsManagerProps) {
  const [departments, setDepartments] = useState<Department[]>([
    ...initialPage.items,
  ]);
  const [statusFilter, setStatusFilter] = useState<DepartmentActivity | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return departments.filter((department) => {
      if (statusFilter && activityOf(department) !== statusFilter) {
        return false;
      }
      if (term === "") {
        return true;
      }
      const managerText = department.manager
        ? personName(department.manager).toLowerCase()
        : "";
      return (
        department.name.toLowerCase().includes(term) ||
        managerText.includes(term)
      );
    });
  }, [departments, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function upsertDepartment(next: Department) {
    setDepartments((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) {
        return [next, ...current];
      }
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function removeDepartment(id: string) {
    setDepartments((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
  }

  const filtersActive = statusFilter !== null || search.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {departments.length} department
          {departments.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New department
        </Button>
      </div>

      <DepartmentFilters
        status={statusFilter}
        search={search}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <DepartmentsTable
        departments={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <CreateDepartmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        managers={managers}
        onCreate={createDepartment}
        onCreated={(department) => {
          upsertDepartment(department);
          setPage(1);
          setSearch("");
          setStatusFilter(null);
        }}
      />

      <DepartmentDetailDialog
        departmentId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        managers={managers}
        getDepartment={getDepartment}
        onUpdate={updateDepartment}
        onAssignManager={assignManager}
        onDeactivate={deactivateDepartment}
        onReactivate={reactivateDepartment}
        onDelete={deleteDepartment}
        onChanged={upsertDepartment}
        onDeleted={removeDepartment}
      />
    </div>
  );
}
