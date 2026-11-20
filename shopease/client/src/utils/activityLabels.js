// Display labels for activity-log entries (the server stores stable action codes).
export const roleLabels={resident:'Resident',staff:'Staff',secretary:'Secretary',captain:'Captain',super_admin:'Super Admin'};
export const actionLabels={
  'report.submitted':'Report submitted','report.cancelled':'Report cancelled by resident','report.status_changed':'Report status changed','report.area_assigned':'Report area updated',
  'blotter.created':'Walk-in blotter recorded','blotter.approved_from_report':'Report approved as blotter','blotter.updated':'Blotter record edited','blotter.archived':'Blotter record archived',
  'community.created':'Community update drafted','community.created_from_report':'Public summary drafted from a report','community.updated':'Community update edited','community.published':'Community update published','community.archived':'Community update archived',
  'resident.created':'Resident record added','resident.updated':'Resident record edited','resident.verified':'Resident verified','resident.unverified':'Resident verification removed','resident.deleted':'Resident record deleted','resident.self_updated':'Resident edited own details',
  'category.created':'Category added','category.updated':'Category updated','area.created':'Area added','area.updated':'Area updated',
  'staff_account.created':'Staff account created','staff_account.updated':'Staff account changed',
};
export const entityTypeLabels={report:'Reports',blotter:'Blotter records',community_update:'Community updates',resident:'Residents',category:'Categories',area:'Areas',staff_account:'Staff accounts'};
