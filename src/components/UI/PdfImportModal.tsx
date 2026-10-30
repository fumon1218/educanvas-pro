import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Layers, CopyPlus } from 'lucide-react';

interface PdfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (mode: 'single' | 'multiple') => void;
  fileName?: string;
}

export const PdfImportModal: React.FC<PdfImportModalProps> = ({ isOpen, onClose, onImport, fileName }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
          >
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">PDF 넣기</h2>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{fileName || 'Document.pdf'}</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="닫기" className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-gray-600 mb-2">PDF 페이지를 어떻게 넣을까요?</p>
              
              <button 
                onClick={() => onImport('single')}
                className="flex items-start gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group"
              >
                <div className="p-3 bg-gray-100 text-gray-500 rounded-xl group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <Layers size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 group-hover:text-indigo-700">현재 슬라이드에 모두 넣기</h3>
                  <p className="text-xs text-gray-500 mt-1">모든 페이지를 사진처럼 지금 슬라이드에 나란히 놓습니다.</p>
                </div>
              </button>

              <button 
                onClick={() => onImport('multiple')}
                className="flex items-start gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group"
              >
                <div className="p-3 bg-gray-100 text-gray-500 rounded-xl group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <CopyPlus size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 group-hover:text-indigo-700">한 페이지씩 슬라이드 만들기 (추천)</h3>
                  <p className="text-xs text-gray-500 mt-1">페이지마다 슬라이드를 하나씩 만들어 넘기며 판서할 수 있습니다.</p>
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
