import { BrandLogo } from "./brand-logo";
import { PageHeader } from "../ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Table } from "../ui/table";

/** Isolated design specimen, never imported by a production route.
 * Example numbers are explicitly illustrative and are not API data.
 * Host imports foundation-preview.css and the normal Tailwind stylesheet.
 */
export function FoundationExamples({ dark = false }: { dark?: boolean }) {
  return (
    <main
      className={`lela-preview ${dark ? "dark" : ""} min-h-screen space-y-8 p-4 sm:p-8`}
    >
      <PageHeader
        title="Lela design foundation"
        description="Design specimen only. User-approved palette; example values are not operational data."
      />

      <section
        aria-label="Login composition"
        className="border-border grid overflow-hidden rounded-2xl border lg:grid-cols-2"
      >
        <div className="preview-hero hidden space-y-8 p-6 sm:p-10 lg:block">
          <BrandLogo />
          <div className="space-y-4">
            <h2 className="max-w-md text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Bring your creative work to life.
            </h2>
            <p className="text-muted-foreground max-w-sm">
              A clear space for your events, projects and team.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge>Events</Badge>
              <Badge>Projects</Badge>
              <Badge>Reports</Badge>
            </div>
          </div>
        </div>
        <div className="bg-card p-6 sm:p-10">
          <Card className="mx-auto max-w-md">
            <BrandLogo compact className="mb-5 w-9" />
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>
                Email/password login layout specimen; no authentication is
                performed here.
              </CardDescription>
            </CardHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="example-email">Email address</Label>
                <Input
                  id="example-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="example-password">Password</Label>
                <Input
                  id="example-password"
                  type="password"
                  autoComplete="current-password"
                  aria-describedby="example-password-help"
                />
                <p
                  id="example-password-help"
                  className="text-muted-foreground text-xs"
                >
                  Use the existing company account sign-in.
                </p>
              </div>
              <Button type="button" disabled className="w-full">
                Sign in (specimen only)
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <section
        aria-label="Shared shell and dashboard composition"
        className="border-border grid overflow-hidden rounded-2xl border lg:grid-cols-[13rem_1fr]"
      >
        <aside className="bg-sidebar text-sidebar-foreground p-5">
          <BrandLogo className="mb-6 w-32" />
          <h2 className="mb-4 text-sm font-semibold">
            Workspace navigation specimen
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="bg-sidebar-primary text-sidebar-primary-foreground rounded-lg px-3 py-2 font-semibold">
              Dashboard — selected
            </li>
            <li className="px-3 py-2">Permitted work areas</li>
            <li className="px-3 py-2">Reports</li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed">
            Example labels, not permission-aware live navigation.
          </p>
        </aside>
        <div className="min-w-0 space-y-6 p-5 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your work, clearly organized
          </h2>
          <p className="text-muted-foreground text-sm">
            The same company identity for every role. Only supported, permitted
            content belongs in the real dashboard.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Next steps</CardTitle>
                <CardDescription>Helpful empty-state guidance</CardDescription>
              </CardHeader>
              <p className="text-sm">
                Your assigned work will appear here when available.
              </p>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Reports</CardTitle>
                <CardDescription>Clear period and ownership</CardDescription>
              </CardHeader>
              <Badge variant="secondary">Draft — example status</Badge>
            </Card>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button">Primary action style</Button>
            <Button type="button" variant="secondary">
              Supporting action style
            </Button>
            <Button type="button" variant="outline">
              Outline action style
            </Button>
            <Button type="button" disabled>
              Disabled style
            </Button>
          </div>
        </div>
      </section>

      <Card aria-labelledby="example-chart-title">
        <CardHeader>
          <CardTitle id="example-chart-title">
            Analytics chart specimen
          </CardTitle>
          <CardDescription>
            Illustrative values only. Real analytics must use authoritative API
            data and current scopes.
          </CardDescription>
        </CardHeader>
        <figure className="max-w-2xl">
          <svg
            className="preview-chart"
            viewBox="0 0 480 210"
            role="img"
            aria-label="Illustrative comparison: sample A 8, sample B 5, sample C 3. Values are also in the table below."
          >
            <text x="0" y="30">
              Sample A
            </text>
            <rect
              x="125"
              y="10"
              width="300"
              height="34"
              rx="4"
              fill="var(--chart-1)"
            />
            <text x="440" y="33">
              8
            </text>
            <text x="0" y="92">
              Sample B
            </text>
            <rect
              x="125"
              y="72"
              width="187.5"
              height="34"
              rx="4"
              fill="var(--chart-2)"
            />
            <text x="327" y="95">
              5
            </text>
            <text x="0" y="154">
              Sample C
            </text>
            <rect
              x="125"
              y="134"
              width="112.5"
              height="34"
              rx="4"
              fill="var(--chart-4)"
            />
            <text x="253" y="157">
              3
            </text>
            <text x="125" y="198">
              Illustrative item count
            </text>
          </svg>
          <figcaption className="text-muted-foreground mb-5 text-sm">
            Labels and numeric equivalents carry meaning, not color alone.
          </figcaption>
        </figure>
        <Table caption="Chart specimen values (not company data)">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Illustrative count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Sample A</th>
              <td>8</td>
            </tr>
            <tr>
              <th scope="row">Sample B</th>
              <td>5</td>
            </tr>
            <tr>
              <th scope="row">Sample C</th>
              <td>3</td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <section
        aria-label="Feedback and validation patterns"
        className="grid gap-4 sm:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle>Readable feedback</CardTitle>
          </CardHeader>
          <ul className="space-y-3 text-sm">
            <li
              className="rounded-lg p-3"
              style={{
                background: "var(--success-background)",
                color: "var(--success)",
              }}
            >
              ✓ Success: saved (example)
            </li>
            <li
              className="rounded-lg p-3"
              style={{
                background: "var(--warning-background)",
                color: "var(--warning)",
              }}
            >
              ! Warning: review required (example)
            </li>
            <li
              className="rounded-lg p-3"
              style={{
                background: "var(--information-background)",
                color: "var(--information)",
              }}
            >
              i Information: scope applies (example)
            </li>
          </ul>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Validation example</CardTitle>
          </CardHeader>
          <Label htmlFor="example-title">Report title</Label>
          <Input
            id="example-title"
            aria-invalid="true"
            aria-describedby="example-title-error"
            className="mt-2"
          />
          <p id="example-title-error" className="text-destructive mt-2 text-sm">
            Example error: enter a report title.
          </p>
        </Card>
      </section>
    </main>
  );
}
