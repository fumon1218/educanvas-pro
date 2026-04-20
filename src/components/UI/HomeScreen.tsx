import React from 'react';
import { motion } from 'motion/react';
import { Home, Plus, Search, Clock, Star, Folder, MoreVertical, Layout, Play, Edit3 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Project {
  id: string;
  name: string;
  thumbnail?: string;
  updatedAt?: string;
}

interface HomeScreenProps {
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onClose: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-gray-50 flex flex-col overflow-hidden"
    >
      {/* Sidebar */}
      <div className="flex h-full">
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col p-6 gap-8">
          <div className="flex items-center gap-3 text-indigo-600">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Home size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight">Whiteboard</span>
          </div>

          <nav className="flex flex-col gap-2">
            <button className="flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-semibold transition-all">
              <Layout size={20} />
              Recent Projects
            </button>
            <button className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 rounded-xl font-medium transition-all">
              <Star size={20} />
              Favorites
            </button>
            <button className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:bg-gray-50 rounded-xl font-medium transition-all">
              <Folder size={20} />
              Shared with me
            </button>
          </nav>

          <div className="mt-auto">
            <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <h4 className="font-bold text-sm mb-1">Upgrade to Pro</h4>
              <p className="text-[10px] opacity-80 mb-3">Get unlimited projects and AI generation.</p>
              <button className="w-full py-2 bg-white text-indigo-600 rounded-lg text-xs font-bold hover:bg-opacity-90 transition-all">
                Learn More
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-10 shrink-0">
            <div className="relative w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="w-full pl-12 pr-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={onCreateProject}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Plus size={20} />
                New Project
              </button>
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold border-2 border-white shadow-sm">
                JD
              </div>
            </div>
          </header>

          {/* Grid */}
          <main className="flex-1 overflow-y-auto p-10 custom-scrollbar">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Recent Projects</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>Sort by:</span>
                  <button className="font-bold text-gray-900 flex items-center gap-1">
                    Last Modified
                    <Clock size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    whileHover={{ y: -5 }}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all group overflow-hidden"
                  >
                    <div 
                      className="aspect-[16/10] bg-gray-100 relative cursor-pointer overflow-hidden"
                      onClick={() => onSelectProject(project.id)}
                    >
                      {project.thumbnail ? (
                        <img 
                          src={project.thumbnail} 
                          alt={project.name} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Layout size={64} strokeWidth={1} />
                        </div>
                      )}
                      
                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); }}
                          className="p-3 bg-white text-indigo-600 rounded-full hover:scale-110 transition-transform shadow-lg"
                        >
                          <Play size={20} fill="currentColor" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); }}
                          className="p-3 bg-white text-gray-700 rounded-full hover:scale-110 transition-transform shadow-lg"
                        >
                          <Edit3 size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <Clock size={12} />
                          {project.updatedAt || "Just now"}
                        </p>
                      </div>
                      <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}

                {/* Add Project Card */}
                <button
                  onClick={onCreateProject}
                  className="aspect-[16/10] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50/30 transition-all"
                >
                  <Plus size={48} strokeWidth={1} />
                  <span className="font-bold text-sm uppercase tracking-widest">Create New</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </motion.div>
  );
};
