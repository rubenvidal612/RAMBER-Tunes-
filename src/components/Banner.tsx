import { X } from 'lucide-react';

export function Banner() {
  return (
    <div className="hidden md:flex w-full bg-gradient-to-r from-cyan-500 to-blue-500 p-2 items-center justify-between text-white border-b border-cyan-800 relative shadow-inner overflow-hidden">
      <div className="flex-1 flex justify-center items-center gap-4 relative z-10">
        <div className="flex items-center gap-3">
            {/* Promo image mock */}
            <div className="w-24 h-12 bg-white/20 rounded relative border border-white/30 overflow-hidden">
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center">
                      <div className="w-0 h-0 border-t-4 border-l-6 border-b-4 border-transparent border-l-white ml-1"></div>
                  </div>
               </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="font-bold text-xl drop-shadow-md">Crea Maquetas con IA</span>
              <div className="bg-yellow-400 text-black text-xs font-black px-2 py-1 rotate-[-10deg] shadow-lg border border-yellow-500 whitespace-nowrap text-center leading-tight">
                5 Canciones<br/>GRATIS
              </div>
            </div>
        </div>
        
        <button className="bg-cyan-200 text-cyan-900 font-bold px-6 py-2 rounded-full hover:bg-cyan-100 transition-colors shadow-lg">
          Aprovecha esta oferta
        </button>
      </div>
      
      <button className="p-2 hover:bg-white/10 rounded-full transition-colors absolute right-4 z-10">
         <X className="w-5 h-5" />
      </button>
      
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
    </div>
  );
}
