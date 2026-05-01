import { useState } from 'react';
import { HelpCircle, Edit2 } from 'lucide-react';

export function EditProfileView({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Ruben');
  const [username, setUsername] = useState('2il67mph');
  const [bio, setBio] = useState('');

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-bottom-8 duration-300 z-[100] fixed inset-0 pb-safe text-white">
      {/* Header */}
      <div className="flex items-center p-4 sticky top-0 bg-[#0a0a0a] z-10">
        <h2 className="text-xl font-bold">Editar</h2>
      </div>

      <div className="p-4 space-y-6 pb-32">
        {/* Banner Image */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-lg">Imagen de perfil</h3>
            <span className="text-slate-400 text-xs font-medium leading-tight max-w-[200px]">(Tamaño recomendado: 1610 × 180 px, máx. 10 MB)</span>
          </div>
          <div className="w-full h-24 rounded-xl bg-gradient-to-r from-teal-900 to-slate-800 relative flex items-center justify-center cursor-pointer overflow-hidden border border-white/5">
            <div className="absolute bottom-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
              <Edit2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        </div>

        {/* Profile Image */}
        <div>
          <h3 className="font-bold text-lg mb-2">Imagen</h3>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-teal-600 flex items-center justify-center text-3xl font-bold text-white shadow-inner">
                R
              </div>
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 cursor-pointer">
                <Edit2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <span className="text-slate-400 text-xs font-medium leading-tight max-w-[180px]">(Tamaño recomendado: 88 × 88 px, máx. 500 KB)</span>
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-base">Nombre</h3>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.substring(0, 20))}
              className="bg-transparent text-white outline-none flex-1 text-[15px]"
            />
            <span className="text-slate-500 text-sm ml-2">{name.length}/20</span>
          </div>
        </div>

        {/* Username */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-base">Nombre de usuario</h3>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <input 
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.substring(0, 20))}
              className="bg-transparent text-white outline-none flex-1 text-[15px]"
            />
            <span className="text-slate-500 text-sm ml-2">{username.length}/20</span>
          </div>
        </div>

        {/* Bio */}
        <div>
          <h3 className="font-bold text-base mb-2">Biografía</h3>
          <div className="bg-white/5 rounded-xl p-4 border border-white/5 relative">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.substring(0, 250))}
              placeholder="Escribe tu biografía"
              className="w-full bg-transparent text-[15px] placeholder:text-slate-500 outline-none min-h-[120px] text-white resize-none"
            />
            <div className="absolute bottom-3 right-4 text-slate-500 text-sm">
              {bio.length} / 250
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Fixed at Bottom */}
      <div className="fixed bottom-0 left-0 w-full p-4 flex gap-4 bg-[#0a0a0a] border-t border-white/5 pb-safe z-20">
        <button 
          onClick={onClose}
          className="flex-1 py-3.5 rounded-full border border-white/20 text-white font-bold hover:bg-white/5 transition-colors"
        >
          Cancelar
        </button>
        <button 
          onClick={onClose}
          className="flex-1 py-3.5 rounded-full bg-green-500 hover:bg-green-400 text-[#020617] font-bold transition-colors"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}