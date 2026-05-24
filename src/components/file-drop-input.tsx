import { useRef, useState } from "react";
import { Button } from "./ui/button";

interface FileDropInputProps extends React.ComponentProps<typeof Button> {
  accept: string;
  onFile: (file: File) => void;
  inputProps?: React.ComponentProps<"input"> & { "data-testid"?: string };
}

export function FileDropInput({
  accept,
  disabled,
  inputProps,
  onFile,
  ...buttonProps
}: FileDropInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    onFile(file);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    if (disabled) {
      return;
    }

    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <>
      <input
        {...inputProps}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="hidden"
      />
      <Button
        {...buttonProps}
        type="button"
        disabled={disabled}
        data-drag-over={isDragOver ? "true" : undefined}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={handleDrop}
      />
    </>
  );
}
