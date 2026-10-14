import type { PrismaClient } from "../../src/generated/prisma/client.js";

/** Valid, least-privilege identity for personal-work integration journeys. */
export async function assignDepartmentMember(
  prisma: PrismaClient,
  userId: string,
) {
  const department = await prisma.department.upsert({
    where: { name: "Production" },
    create: { name: "Production" },
    update: {},
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: "Department Member" },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      departmentId: department.id,
      roleAssignment: {
        upsert: { create: { roleId: role.id }, update: { roleId: role.id } },
      },
    },
  });
}
