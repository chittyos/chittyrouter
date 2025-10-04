// Analytics module for monitoring the unified ChittyOS worker
export class Analytics {
  constructor(accountId, apiToken) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.endpoint = "https://api.cloudflare.com/client/v4/graphql";
  }

  // Query worker analytics using GraphQL
  async getWorkerMetrics(workerName, startDate, endDate) {
    const query = `
      query GetWorkerAnalytics($accountTag: string!, $filter: WorkersInvocationsAdaptiveFilter_InputObject) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            workersInvocationsAdaptive(
              limit: 10000,
              filter: $filter
            ) {
              sum {
                requests
                errors
                subrequests
                responseBodySize
                wallTime
                cpuTime
              }
              dimensions {
                datetime
                scriptName
                status
              }
            }
          }
        }
      }
    `;

    const variables = {
      accountTag: this.accountId,
      filter: {
        scriptName: workerName,
        datetime_geq: startDate,
        datetime_leq: endDate,
      },
    };

    return await this.executeQuery(query, variables);
  }

  // Get D1 database metrics
  async getD1Metrics(databaseId, startDate, endDate) {
    const query = `
      query GetD1Analytics($accountTag: string!, $filter: D1AnalyticsAdaptiveFilter_InputObject) {
        viewer {
          accounts(filter: {accountTag: $accountTag}) {
            d1AnalyticsAdaptive(
              limit: 10000,
              filter: $filter
            ) {
              sum {
                queryCount
                rowsRead
                rowsWritten
                storageBytes
              }
              dimensions {
                datetime
                databaseId
              }
            }
          }
        }
      }
    `;

    const variables = {
      accountTag: this.accountId,
      filter: {
        databaseId: databaseId,
        datetime_geq: startDate,
        datetime_leq: endDate,
      },
    };

    return await this.executeQuery(query, variables);
  }

  // Execute GraphQL query
  async executeQuery(query, variables) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Analytics API error: ${response.status}`);
    }

    return await response.json();
  }

  // Generate analytics dashboard data
  async getDashboardData(workerName) {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours

    const metrics = await this.getWorkerMetrics(workerName, startDate, endDate);

    return {
      timestamp: new Date().toISOString(),
      period: "24h",
      metrics:
        metrics.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.sum ||
        {},
      services: ["platform", "bridge", "consultant", "chain", "cto", "landing"],
    };
  }
}

// Export analytics handler for the worker
export async function handleAnalytics(request, env) {
  const analytics = new Analytics(env.ACCOUNT_ID, env.API_TOKEN);

  try {
    const data = await analytics.getDashboardData("chitty-ultimate-worker");

    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(`Analytics error: ${error.message}`, {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
}
