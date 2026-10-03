/** Topics shown as filters on /insights/. Add a topic here before using it in an article. */
export const insightTopics = ['ServiceNow AI', 'CMDB & CSDM', 'ITOM', 'Architecture'] as const;

export type InsightTopic = (typeof insightTopics)[number];
