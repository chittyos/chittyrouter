import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  EnvelopeIcon,
  CpuChipIcon,
  DocumentTextIcon,
  HeartIcon,
  ChartBarIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Email Routing', href: '/email-routing', icon: EnvelopeIcon },
  { name: 'AI Agents', href: '/ai-agents', icon: CpuChipIcon },
  { name: 'ChittyID Management', href: '/chittyid', icon: DocumentTextIcon },
  { name: 'Service Health', href: '/health', icon: HeartIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <Transition show={sidebarOpen} className="relative z-50 lg:hidden">
        <div className="fixed inset-0 bg-gray-900/80" onClick={() => setSidebarOpen(false)} />

        <div className="fixed inset-0 flex">
          <div className="relative mr-16 flex w-full max-w-xs flex-1">
            <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
              <button
                type="button"
                className="-m-2.5 p-2.5"
                onClick={() => setSidebarOpen(false)}
              >
                <XMarkIcon className="h-6 w-6 text-white" />
              </button>
            </div>

            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 ring-1 ring-white/10">
              <div className="flex h-16 shrink-0 items-center">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 gradient-chitty rounded-lg flex items-center justify-center">
                      <CpuChipIcon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">ChittyRouter</h1>
                    <p className="text-xs text-gray-500">AI Gateway</p>
                  </div>
                </div>
              </div>

              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {navigation.map((item) => (
                        <li key={item.name}>
                          <NavLink
                            to={item.href}
                            className={({ isActive }) =>
                              classNames(
                                isActive
                                  ? 'bg-chitty-50 text-chitty-700 border-r-2 border-chitty-600'
                                  : 'text-gray-700 hover:text-chitty-600 hover:bg-gray-50',
                                'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium transition-all duration-200'
                              )
                            }
                            onClick={() => setSidebarOpen(false)}
                          >
                            <item.icon
                              className={classNames(
                                location.pathname === item.href ? 'text-chitty-600' : 'text-gray-400 group-hover:text-chitty-600',
                                'h-6 w-6 shrink-0 transition-colors duration-200'
                              )}
                            />
                            {item.name}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </Transition>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white border-r border-gray-200 px-6">
          <div className="flex h-16 shrink-0 items-center">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 gradient-chitty rounded-xl flex items-center justify-center shadow-lg">
                  <CpuChipIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">ChittyRouter</h1>
                <p className="text-sm text-gray-500">AI Gateway v2.0</p>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) =>
                          classNames(
                            isActive
                              ? 'bg-chitty-50 text-chitty-700 border-r-4 border-chitty-600 shadow-sm'
                              : 'text-gray-700 hover:text-chitty-600 hover:bg-gray-50',
                            'group flex gap-x-3 rounded-l-lg p-3 text-sm leading-6 font-medium transition-all duration-200 hover-scale-sm'
                          )
                        }
                      >
                        <item.icon
                          className={classNames(
                            location.pathname === item.href ? 'text-chitty-600' : 'text-gray-400 group-hover:text-chitty-600',
                            'h-6 w-6 shrink-0 transition-colors duration-200'
                          )}
                        />
                        {item.name}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>

          {/* Status indicator */}
          <div className="mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <div className="status-dot status-healthy mr-2 animate-pulse-slow"></div>
                <div className="text-sm">
                  <p className="font-medium text-green-800">System Healthy</p>
                  <p className="text-green-600">All services operational</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top navbar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white/80 backdrop-blur-md px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-200 lg:hidden" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Breadcrumb */}
              <div className="hidden lg:block">
                <nav className="flex" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-2">
                    <li>
                      <div className="flex items-center text-sm">
                        <span className="font-medium text-gray-500">ChittyRouter</span>
                        <span className="mx-2 text-gray-400">/</span>
                        <span className="font-medium text-chitty-600">
                          {navigation.find(item => item.href === location.pathname)?.name || 'Dashboard'}
                        </span>
                      </div>
                    </li>
                  </ol>
                </nav>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-x-4 lg:gap-x-6">
              {/* Notifications */}
              <button
                type="button"
                className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 transition-colors duration-200"
              >
                <BellIcon className="h-6 w-6" />
              </button>

              {/* Separator */}
              <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" />

              {/* Profile dropdown */}
              <Menu as="div" className="relative">
                <Menu.Button className="-m-1.5 flex items-center p-1.5 hover:bg-gray-50 rounded-lg transition-colors duration-200">
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                  <span className="hidden lg:flex lg:items-center">
                    <span className="ml-2 text-sm font-semibold leading-6 text-gray-900">
                      Admin
                    </span>
                  </span>
                </Menu.Button>

                <Transition
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
                    <Menu.Item>
                      <a className="block px-3 py-1 text-sm leading-6 text-gray-900 hover:bg-gray-50">
                        Settings
                      </a>
                    </Menu.Item>
                    <Menu.Item>
                      <a className="block px-3 py-1 text-sm leading-6 text-gray-900 hover:bg-gray-50">
                        Sign out
                      </a>
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>
          </div>
        </div>

        <main className="py-8">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="animate-fade-in">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}