/**
 * DEVELOPMENT SEED — fictional data only.
 * Refuses to run against production: seed is never automatic, never silent.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (env === "production" || /prod/i.test(dbUrl)) {
    console.error("\n✖ Refusing to seed: production environment detected.");
    console.error("  Demo data must NEVER be written to a production database.\n");
    process.exit(1);
  }
  console.log("Seeding development database with FICTIONAL demo data…");

  await prisma.salarySchedule.create({
    data: {
      id: "ss1", name: "Standardized Salary Schedule (2024, demo)", effectiveFrom: new Date("2024-01-01"),
      note: "DEMO indexation — validate against the official SSL before production payroll.",
      grades: {
        create: Array.from({ length: 33 * 8 }, (_, i) => {
          const grade = Math.floor(i / 8) + 1;
          const step = (i % 8) + 1;
          return { grade, step, cents: ((13_000 + (grade - 1) * 2_200) + (step - 1) * 2_000).toFixed(2) };
        }),
      },
    },
  }).catch(() => console.log("  • salary schedule exists"));

  await prisma.workShift.createMany({
    data: [
      { id: "sh1", name: "Regular (8:00 AM – 5:00 PM)", startMin: 480, endMin: 1020, graceMin: 15, lunchMin: 60 },
      { id: "sh2", name: "Afternoon (1:00 PM – 10:00 PM)", startMin: 780, endMin: 1320, graceMin: 15, lunchMin: 60 },
    ],
    skipDuplicates: true,
  });

  await prisma.deductionScheme.createMany({
    data: [
      { id: "sch_gsis", code: "GSIS", name: "GSIS Life & Retirement", description: "Government Service Insurance System premium." },
      { id: "sch_ph", code: "PHILHEALTH", name: "PhilHealth", description: "National health insurance contribution." },
      { id: "sch_pi", code: "PAGIBIG", name: "Pag-IBIG Fund", description: "HDMF savings contribution." },
      { id: "sch_wtax", code: "WTAX", name: "Withholding Tax", description: "Compensation income tax (semi-monthly brackets)." },
    ],
    skipDuplicates: true,
  });

  // DEMO contribution tables — demo=true until validated against official issuances.
  await prisma.contributionRule.createMany({
    data: [
      { id: "cr_g2", schemeId: "sch_gsis", effectiveFrom: new Date("2024-01-01"), employeeBps: 900, employerBps: 1250, note: "GSIS demo table — 9% / 12.5%", demo: true },
      { id: "cr_p1", schemeId: "sch_ph", effectiveFrom: new Date("2024-01-01"), employeeBps: 250, monthlyCapCents: "100000.00", note: "PhilHealth demo table", demo: true },
      { id: "cr_h1", schemeId: "sch_pi", effectiveFrom: new Date("2024-01-01"), employeeBps: 200, monthlyCapCents: "10000.00", note: "Pag-IBIG demo table", demo: true },
      { id: "cr_t1", schemeId: "sch_wtax", effectiveFrom: new Date("2024-01-01"), note: "TRAIN semi-monthly demo brackets", demo: true },
    ],
    skipDuplicates: true,
  });
  await prisma.taxBracket.createMany({
    data: [
      { ruleId: "cr_t1", fromCents: "0", toCents: "20833.00", baseCents: "0", rateBps: 0 },
      { ruleId: "cr_t1", fromCents: "20833.00", toCents: "33333.00", baseCents: "0", rateBps: 1500 },
      { ruleId: "cr_t1", fromCents: "33333.00", toCents: "66667.00", baseCents: "1875.00", rateBps: 2000 },
      { ruleId: "cr_t1", fromCents: "66667.00", toCents: "166667.00", baseCents: "8333.33", rateBps: 2500 },
      { ruleId: "cr_t1", fromCents: "166667.00", toCents: "666667.00", baseCents: "33333.33", rateBps: 3000 },
      { ruleId: "cr_t1", fromCents: "666667.00", toCents: null, baseCents: "183333.33", rateBps: 3500 },
    ],
    skipDuplicates: true,
  });

  await prisma.leaveType.createMany({
    data: [
      { id: "lt_vl", code: "VL", name: "Vacation Leave", annualDays: 15 },
      { id: "lt_sl", code: "SL", name: "Sick Leave", annualDays: 15, requiresDoc: true },
      { id: "lt_el", code: "EL", name: "Emergency Leave", annualDays: 5 },
      { id: "lt_ml", code: "ML", name: "Mandatory Leave", annualDays: 5 },
    ],
    skipDuplicates: true,
  });
  await prisma.loanType.createMany({
    data: [
      { id: "ln_gsis", code: "GSIS-PL", name: "GSIS Personal Loan", maxAmountCents: "500000.00", maxTermMonths: 36 },
      { id: "ln_pi", code: "HDMF-MPL", name: "Pag-IBIG Multi-Purpose Loan", maxAmountCents: "300000.00", maxTermMonths: 24 },
      { id: "ln_sal", code: "SAL", name: "Agency Salary Loan", maxAmountCents: "200000.00", maxTermMonths: 36 },
      { id: "ln_em", code: "EMG", name: "Emergency Loan", maxAmountCents: "100000.00", maxTermMonths: 24 },
    ],
    skipDuplicates: true,
  });
  await prisma.allowanceType.createMany({
    data: [
      { id: "al_pera", code: "PERA", name: "Personnel Economic Relief Allowance", monthlyCents: "2000.00" },
      { id: "al_rice", code: "RICE", name: "Rice Subsidy", monthlyCents: "2000.00" },
      { id: "al_hazard", code: "HZD", name: "Hazard Pay", monthlyCents: "3000.00", taxable: true },
      { id: "al_comm", code: "COMM", name: "Communication Allowance", monthlyCents: "300.00", taxable: true },
    ],
    skipDuplicates: true,
  });
  await prisma.systemSetting.createMany({
    data: [
      { key: "agency_name", value: "Department of Civic Services (Demo Agency)" },
      { key: "payroll_cutoff_rule", value: "Semi-monthly: 1–15 / 16–end; cutoff 10th & 25th" },
      { key: "demo_notice", value: "All government contribution/tax tables are DEMO configuration." },
    ],
    skipDuplicates: true,
  });

  console.log("✔ Seed complete. Employees/users: create via API or extend this script.");
  console.log("  Remember: demo tables (demo=true) must be replaced with validated official rates.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
