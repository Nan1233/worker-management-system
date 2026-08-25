import api from "./api";

export interface ReportEditProposal {
  id: number;
  report_id: number;
  proposer_user_id: number;
  proposer_role: string;
  proposer_name?: string | null;
  proposer_username?: string | null;
  worker_code?: string | null;
  worker_name?: string | null;
  work_date?: string | null;
  shift?: string | null;
  process_id?: number | null;
  machine_no?: string | null;
  product_name?: string | null;
  reason: string;
  proposed_data: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

const unwrap = (res: any) => res?.data?.data ?? res?.data ?? [];

export const getReportEditProposals = async (): Promise<ReportEditProposal[]> =>
  unwrap(await api.get("/production-temp/edit-proposals"));

export const createReportEditProposal = async (data: {
  report_id: number;
  reason: string;
  proposed_data: Record<string, any>;
}) => unwrap(await api.post("/production-temp/edit-proposals", data));

export const updateReportEditProposal = async (
  id: number,
  data: { reason: string; proposed_data: Record<string, any> }
) => unwrap(await api.put(`/production-temp/edit-proposals/${id}`, data));

export const deleteReportEditProposal = async (id: number) =>
  api.delete(`/production-temp/edit-proposals/${id}`);
