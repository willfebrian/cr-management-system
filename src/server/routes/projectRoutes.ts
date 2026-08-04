import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import * as projectRepository from "../db/projectRepository.js";
import { ProjectRepositoryError } from "../db/projectRepository.js";
import type { ProjectFilters, ProjectStatus } from "../../shared/projectTypes.js";
import {
  buildProjectCrTransportDocument,
  getProjectCrTransportReadiness,
  ProjectCrTransportReadinessError
} from "../templates/projectCrTransportService.js";

type ProjectRepositoryContract = Pick<
  typeof projectRepository,
  | "listProjects"
  | "getProjectDetail"
  | "searchProjectIssueOptions"
  | "searchProjectOwners"
  | "saveProject"
  | "cancelProject"
  | "deleteProject"
>;

type ProjectRouteDependencies = {
  repository: ProjectRepositoryContract;
  documentService?: {
    getReadiness(projectId: number): ReturnType<typeof getProjectCrTransportReadiness>;
    buildDocument(projectId: number): ReturnType<typeof buildProjectCrTransportDocument>;
  };
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
};

export function createProjectRoutes(dependencies: ProjectRouteDependencies) {
  const routes = Router();
  const repository = dependencies.repository;
  const documentService = dependencies.documentService || {
    getReadiness: getProjectCrTransportReadiness,
    buildDocument: buildProjectCrTransportDocument
  };
  routes.use(dependencies.requireAuth);

  routes.get("/", handle(async (req, res) => {
    const filters: ProjectFilters = {
      q: text(req.query.q),
      status: text(req.query.status) as ProjectStatus | "all" | undefined,
      page: numberValue(req.query.page),
      pageSize: numberValue(req.query.pageSize)
    };
    res.json(await repository.listProjects(filters));
  }));

  routes.get("/issue-options", handle(async (req, res) => {
    res.json({
      rows: await repository.searchProjectIssueOptions(
        text(req.query.q) || "",
        numberValue(req.query.excludeProjectId)
      )
    });
  }));

  routes.get("/owner-options", handle(async (req, res) => {
    res.json({ rows: await repository.searchProjectOwners(text(req.query.q) || "") });
  }));

  routes.get("/:id/cr-transport-readiness", handle(async (req, res) => {
    res.json(await documentService.getReadiness(Number(req.params.id)));
  }));

  routes.get("/:id/cr-transport-document", handle(async (req, res) => {
    const document = await documentService.buildDocument(Number(req.params.id));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${document.filename.replace(/[\r\n\"]/g, "-")}"`);
    res.send(document.buffer);
  }));

  routes.get("/:id", handle(async (req, res) => {
    res.json(await repository.getProjectDetail(Number(req.params.id)));
  }));

  routes.post("/", handle(async (req, res) => {
    res.status(201).json(await repository.saveProject(req.body, req.authUser!));
  }));

  routes.put("/:id", handle(async (req, res) => {
    res.json(await repository.saveProject({ ...req.body, id: Number(req.params.id) }, req.authUser!));
  }));

  routes.post("/:id/cancel", handle(async (req, res) => {
    res.json(await repository.cancelProject(
      Number(req.params.id),
      String(req.body?.reason || ""),
      req.authUser!
    ));
  }));

  routes.delete("/:id", dependencies.requireAdmin, handle(async (req, res) => {
    res.json(await repository.deleteProject(Number(req.params.id), req.authUser!));
  }));

  return routes;
}

export const projectRoutes = createProjectRoutes({
  repository: projectRepository,
  documentService: {
    getReadiness: getProjectCrTransportReadiness,
    buildDocument: buildProjectCrTransportDocument
  },
  requireAuth,
  requireAdmin
});

function handle(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((error) => sendProjectError(error, res, next));
  };
}

function sendProjectError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof ProjectCrTransportReadinessError) {
    return res.status(409).json({ message: error.message, readiness: error.readiness });
  }
  if (error instanceof ProjectRepositoryError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  next(error);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
