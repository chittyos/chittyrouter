import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { classNames } from '../utils/helpers';

export default function StatCard({ stat }) {
  return (
    <div className="card hover-scale-sm overflow-hidden">
      <div className="card-body">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={classNames(
              'p-3 rounded-lg',
              stat.changeType === 'increase' ? 'bg-green-100' :
              stat.changeType === 'decrease' ? 'bg-red-100' :
              'bg-chitty-100'
            )}>
              <stat.icon className={classNames(
                'h-6 w-6',
                stat.changeType === 'increase' ? 'text-green-600' :
                stat.changeType === 'decrease' ? 'text-red-600' :
                'text-chitty-600'
              )} />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {stat.name}
              </dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-bold text-gray-900">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                  {stat.suffix && <span className="text-sm font-normal text-gray-500 ml-1">{stat.suffix}</span>}
                </div>
                {stat.change && (
                  <div className={classNames(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    stat.changeType === 'increase' ? 'text-green-600' :
                    stat.changeType === 'decrease' ? 'text-red-600' :
                    'text-gray-600'
                  )}>
                    {stat.changeType === 'increase' ? (
                      <ArrowUpIcon className="self-center flex-shrink-0 h-4 w-4 mr-1" />
                    ) : stat.changeType === 'decrease' ? (
                      <ArrowDownIcon className="self-center flex-shrink-0 h-4 w-4 mr-1" />
                    ) : null}
                    <span>{stat.change}</span>
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>

      {/* Optional trend indicator */}
      {stat.trend && (
        <div className="bg-gray-50 px-6 py-3">
          <div className="text-sm">
            <span className="text-gray-600">Trend: </span>
            <span className={classNames(
              'font-medium',
              stat.trend === 'up' ? 'text-green-600' :
              stat.trend === 'down' ? 'text-red-600' :
              'text-gray-600'
            )}>
              {stat.trend === 'up' ? '↗ Increasing' :
               stat.trend === 'down' ? '↘ Decreasing' :
               '→ Stable'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}