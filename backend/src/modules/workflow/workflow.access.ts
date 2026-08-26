export interface WorkflowActor {
  role: string;
  entrepriseId: string | null;
}

export interface WorkflowResourceScope {
  entrepriseId: string | null;
  marcheIds: string[];
}

export function canAccessWorkflowResource(
  actor: WorkflowActor,
  resource: WorkflowResourceScope,
  marchesAffectes: string[] | null,
): boolean {
  if (actor.role === "ENTREPRISE") {
    return actor.entrepriseId !== null && actor.entrepriseId === resource.entrepriseId;
  }

  if (marchesAffectes !== null) {
    return marchesAffectes.length > 0
      && resource.marcheIds.some((marcheId) => marchesAffectes.includes(marcheId));
  }

  return true;
}

export function canSeeWorkflowTask(
  actorRole: string,
  stepRole: string | null,
  isSupervisor: boolean,
  resourceInScope: boolean,
): boolean {
  if (actorRole === "ENTREPRISE" || !resourceInScope) return false;
  return isSupervisor || stepRole === actorRole;
}

export function isHumanBpmnStep(typeTache: string, isSystem: boolean): boolean {
  return typeTache !== "SERVICE_TASK" && !isSystem;
}
