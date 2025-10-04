import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  EnvelopeIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

import StatCard from '../components/StatCard';
import ActivityFeed from '../components/ActivityFeed';
import RealtimeChart from '../components/RealtimeChart';
import AIStatusPanel from '../components/AIStatusPanel';
import { fetchDashboardData } from '../api/chittyrouter';

function Dashboard() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardData,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const stats = [
    {
      name: 'Emails Processed Today',
      value: dashboardData?.emailsProcessed || 0,
      icon: EnvelopeIcon,
      change: '+12%',
      changeType: 'increase',
    },
    {
      name: 'AI Processing Time',
      value: `${dashboardData?.avgProcessingTime || 0}ms`,
      icon: CpuChipIcon,
      change: '-5%',
      changeType: 'decrease',
    },
    {
      name: 'Active ChittyIDs',
      value: dashboardData?.activeChittyIds || 0,
      icon: DocumentTextIcon,
      change: '+8%',
      changeType: 'increase',
    },
    {
      name: 'Service Health',
      value: dashboardData?.healthScore || 0,
      suffix: '%',
      icon: dashboardData?.healthScore > 95 ? CheckCircleIcon : ExclamationTriangleIcon,
      change: '+2%',
      changeType: 'increase',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">ChittyRouter AI Gateway</h1>
        <p className="mt-1 text-sm text-gray-600">
          Real-time monitoring and management for AI-powered email routing
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.name} stat={stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Status Panel */}
        <div className="lg:col-span-1">
          <AIStatusPanel data={dashboardData?.aiStatus} />
        </div>

        {/* Realtime Chart */}
        <div className="lg:col-span-2">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Email Processing Volume</h3>
                <ChartBarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <RealtimeChart data={dashboardData?.processingData} />
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityFeed
          title="Recent AI Routing Decisions"
          activities={dashboardData?.recentRouting}
        />
        <ActivityFeed
          title="ChittyID Generation Activity"
          activities={dashboardData?.recentChittyIds}
        />
      </div>

      {/* Service Registry Status */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">ChittyOS Service Registry</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-green-600">
                {dashboardData?.registry?.connectedServices || 0}
              </div>
              <div className="text-sm text-gray-600">Connected Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-blue-600">
                {dashboardData?.registry?.healthyServices || 0}
              </div>
              <div className="text-sm text-gray-600">Healthy Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-yellow-600">
                {dashboardData?.registry?.lastSync ?
                  new Date(dashboardData.registry.lastSync).toLocaleTimeString() :
                  'Never'
                }
              </div>
              <div className="text-sm text-gray-600">Last Registry Sync</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;