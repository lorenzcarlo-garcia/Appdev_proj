// "First Middle Last" for the resident who filed a report.
export const reporterName=reporter=>reporter?[reporter.first_name,reporter.middle_name,reporter.last_name].filter(Boolean).join(' '):'';
