/**
 * Console values of an instance's platform (EPH-01 models only Linux and Windows).
 * Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/billing-info-fields.html
 * ("Sample data: usage operation by platform", read 2026-11-06).
 */
export const PLATFORM_DETAILS = { linux: 'Linux/UNIX', windows: 'Windows' } as const;
export const USAGE_OPERATION = { linux: 'RunInstances', windows: 'RunInstances:0002' } as const;
