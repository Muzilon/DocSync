import { RotateCw, WifiOff } from 'lucide-react';
import { Botao } from './Botao.tsx';
import estilos from './Estados.module.css';

export function Carregando({ texto = 'Carregando…', telaInteira }: { texto?: string; telaInteira?: boolean }) {
  return (
    <div className={`${estilos.estado} ${telaInteira ? estilos.telaInteira : ''}`} role="status">
      <span className={estilos.spinner} aria-hidden="true" />
      <p>{texto}</p>
    </div>
  );
}

interface ErroProps {
  mensagem: string;
  aoTentarNovamente: () => void;
  telaInteira?: boolean;
}

export function ErroCarregamento({ mensagem, aoTentarNovamente, telaInteira }: ErroProps) {
  return (
    <div className={`${estilos.estado} ${telaInteira ? estilos.telaInteira : ''}`} role="alert">
      <WifiOff className={estilos.iconeErro} size={24} aria-hidden="true" />
      <p className={estilos.titulo}>Não foi possível carregar</p>
      <p>{mensagem}</p>
      <Botao onClick={aoTentarNovamente} icone={<RotateCw size={16} aria-hidden="true" />}>
        Tentar novamente
      </Botao>
    </div>
  );
}
