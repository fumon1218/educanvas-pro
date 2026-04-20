import React, { useState } from 'react';
import { Users, X, Copy, Check, Link, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  multiplayer: any; // ReturnType of useMultiplayer
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({ isOpen, onClose, multiplayer }) => {
  const [targetRoomId, setTargetRoomId] = useState('');
  const [copied, setCopied] = useState(false);

  // For testing/prototype, we use static username for now, or could add an input field.
  
  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (multiplayer.roomId) {
      navigator.clipboard.writeText(multiplayer.roomId);
      setCopied(true);
      toast.success("방 코드가 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = () => {
    if (targetRoomId.trim()) {
      multiplayer.joinRoom(targetRoomId.trim());
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-800">실시간 협업 (Multiplayer)</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-6">
            
            {multiplayer.status === 'disconnected' && (
              <>
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center">
                     <Users className="w-8 h-8 text-indigo-500" />
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 text-center">
                  친구와 함께 같은 화면에서 동시에 그림을 그려보세요! 방을 만들거나 코드를 입력해 참가할 수 있습니다.
                </p>

                <div className="flex flex-col gap-3 pt-2">
                  <button 
                    onClick={multiplayer.createRoom}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium shadow-sm hover:bg-indigo-700 hover:shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Link className="w-4 h-4" />
                    새로운 방 만들기
                  </button>
                  
                  <div className="relative flex items-center justify-center py-2">
                    <div className="absolute border-t border-gray-200 w-full"></div>
                    <span className="relative bg-white px-3 text-xs text-gray-400 uppercase tracking-widest font-medium">단축 코드 입력</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="예) edu-a1b2c3"
                      value={targetRoomId}
                      onChange={(e) => setTargetRoomId(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all text-sm"
                    />
                    <button 
                      onClick={handleJoin}
                      disabled={!targetRoomId.trim()}
                      className="px-4 py-2.5 bg-gray-800 text-white rounded-xl font-medium shadow-sm hover:bg-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                    >
                      참가하기
                    </button>
                  </div>
                </div>
              </>
            )}

            {multiplayer.status === 'connecting' && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">연결 중입니다...</p>
              </div>
            )}

            {multiplayer.status === 'connected' && (
              <div className="flex flex-col gap-5">
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-start gap-3">
                  <div className="p-1 bg-green-100 rounded-full mt-0.5">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-green-800">성공적으로 연결되었습니다!</h3>
                    <p className="text-xs text-green-600 mt-1">현재 {multiplayer.peers.length + 1}명이 캔버스에 참여하고 있습니다.</p>
                  </div>
                </div>

                {multiplayer.isHost && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">초대 코드</label>
                    <div className="flex items-center gap-2 p-1 pl-4 bg-gray-50 border border-gray-200 rounded-xl">
                      <span className="flex-1 font-mono text-sm text-gray-700 tracking-wide select-all">{multiplayer.roomId}</span>
                      <button 
                        onClick={handleCopyLink}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        {copied ? '복사됨' : '코드 복사'}
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  onClick={multiplayer.leaveRoom}
                  className="w-full py-2.5 mt-2 text-red-600 bg-red-50 hover:bg-red-100 font-medium rounded-xl transition-colors text-sm"
                >
                  연결 종료하기
                </button>
              </div>
            )}

            {multiplayer.status === 'error' && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-gray-800 font-medium">연결에 실패했습니다</h3>
                  <p className="text-sm text-gray-500 mt-1">방 코드가 올바른지 확인해주세요.</p>
                </div>
                <button 
                  onClick={multiplayer.leaveRoom}
                  className="mt-2 px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors text-sm"
                >
                  뒤로 가기
                </button>
              </div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
