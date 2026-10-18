'use client';

import type { ButtonHTMLAttributes } from 'react';

/**
 * Botão de submit com confirm() nativo antes de disparar o form — reusado em
 * toda ação destrutiva de um clique só (cancelar lembrete, etc.) pra não
 * depender de cada página reimplementar a mesma checagem. Ações mais graves
 * (excluir instância Evolution) continuam exigindo digitar um texto, não só
 * confirmar — este componente é pro nível "um clique errado não devia bastar".
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  onClick,
  ...buttonProps
}: { confirmMessage: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...buttonProps}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
