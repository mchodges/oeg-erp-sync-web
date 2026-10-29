import { fetchAllRecords, normalizeLinkedIds } from "./airtable";

/** The "README" Airtable base that holds the project backlog (Tasks table). */
const README_BASE_ID = () => process.env.README_BASE_ID ?? "appPNmgsRA4jddQkl";
const TASKS_TABLE = () => process.env.README_TASKS_TABLE_ID ?? "tblHKVKXgVU7NmY7K";
/** The Projects row for the OEG sync web app; only tasks linked to it are shown. */
const PROJECT_RECORD_ID = () => process.env.README_PROJECT_RECORD_ID ?? "recj16IDVEdMTBsXd";

export interface DevTask {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  description: string;
  resolutionNotes: string;
  dateAdded: string;
}

export interface DevTasksResult {
  tasks: DevTask[];
  /** Set when the backlog could not be read; the page shows it instead of the list. */
  error?: string;
}

const STATUS_ORDER = ["In Progress", "Not Started", "Answered", "Done", "Won't Do"];
const PRIORITY_ORDER = ["High", "Medium", "Low"];

function rank(order: string[], value: string): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

export async function fetchDevTasks(): Promise<DevTasksResult> {
  try {
    const records = await fetchAllRecords(
      TASKS_TABLE(),
      {
        fields: ["Title", "Project", "Type", "Status", "Priority", "Description", "Resolution_Notes", "Date_Added"],
      },
      README_BASE_ID(),
    );
    const tasks = records
      .filter((r) => normalizeLinkedIds(r.fields.Project).includes(PROJECT_RECORD_ID()))
      .map((r) => ({
        id: r.id,
        title: String(r.fields.Title ?? "").trim(),
        type: String(r.fields.Type ?? ""),
        status: String(r.fields.Status ?? ""),
        priority: String(r.fields.Priority ?? ""),
        description: String(r.fields.Description ?? "").trim(),
        resolutionNotes: String(r.fields.Resolution_Notes ?? "").trim(),
        dateAdded: String(r.fields.Date_Added ?? ""),
      }))
      .sort(
        (a, b) =>
          rank(STATUS_ORDER, a.status) - rank(STATUS_ORDER, b.status) ||
          rank(PRIORITY_ORDER, a.priority) - rank(PRIORITY_ORDER, b.priority) ||
          a.title.localeCompare(b.title),
      );
    return { tasks };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const denied = /\b(403|404)\b/.test(message);
    return {
      tasks: [],
      error: denied
        ? "Airtable would not let the app read the README base. Add that base to the AIRTABLE_API_KEY token's scope (data.records:read) and reload."
        : message.slice(0, 300),
    };
  }
}
