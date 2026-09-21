/**
 * Nivel atomico: Atomo
 * Componente: Input
 */
import { InputHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    // Casi ningún uso pasa id ni name, y sin ellos htmlFor quedaba vacío: la
    // etiqueta no se asociaba al campo y un lector de pantalla no la anunciaba.
    // useId genera un identificador estable entre servidor y cliente.
    const idGenerado = useId();
    const inputId = id || rest.name || idGenerado;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-ayuda`;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secundario mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          // El error se pintaba debajo en rojo y nada más. Quien no ve el
          // color no se entera de que el campo está mal, y quien escucha la
          // página no oye el motivo: hay que decirlo y hay que enlazarlo.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={clsx(
            'w-full rounded-md border px-3 py-2 text-base text-principal placeholder-tenue',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            error
              ? 'border-danger-500 focus:ring-danger-500 focus:border-danger-500'
              : 'border-borde',
            className,
          )}
          {...rest}
        />
        {error && (
          <p id={errorId} className="mt-1 text-sm text-danger-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-sm text-tenue">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
