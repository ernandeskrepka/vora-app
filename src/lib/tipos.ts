/**
 * Ponto unico de reexportacao dos tipos do Prisma.
 * O Prisma 7 gera os modelos com sufixo "Model"; aqui damos nomes curtos
 * para o resto do codigo nao depender dessa convencao.
 */
export type {
  AdInsightDailyModel as AdInsightDaily,
  ApprovalDecisionModel as ApprovalDecision,
  ApprovalRequestModel as ApprovalRequest,
  AuditLogModel as AuditLog,
  ClientContactModel as ClientContact,
  ClientModel as Cliente,
  MetaConnectionModel as MetaConnection,
  NotificationModel as Notificacao,
  PostMediaModel as PostMedia,
  PostModel as Post,
  PostPublicationModel as PostPublication,
  PublishAttemptModel as PublishAttempt,
  SessionModel as Sessao,
  UserModel as Usuario,
} from "@/generated/prisma/models.ts";

export {
  ActorType,
  ApprovalDecisionType,
  ApprovalRequestStatus,
  MediaKind,
  MetaAssetType,
  MetaAuthMode,
  MetaConnectionStatus,
  Network,
  NotificationChannel,
  NotificationStatus,
  PostFormat,
  PostStatus,
  PublishAttemptStatus,
  UserRole,
} from "@/generated/prisma/enums.ts";
