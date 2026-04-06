import { getProject, listProjects } from "../../../lib/agent";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("id");

  if (projectId) {
    const project = await getProject(projectId);
    return Response.json(project);
  }

  const projects = await listProjects();
  return Response.json({ projects });
}
