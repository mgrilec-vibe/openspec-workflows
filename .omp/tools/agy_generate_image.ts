import { promises as fs } from "node:fs";
import { extname, isAbsolute } from "node:path";

const IMAGE_EXTENSIONS: Record<string, true> = {
  ".jpg": true,
  ".jpeg": true,
  ".png": true,
  ".webp": true,
};
const IMAGE_MIME_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};
const OUTPUT_INSTRUCTION =
  "write the generated image to disk and output only one absolute image path, no prose/Markdown.";

type ExecResult = {
  code: number | null;
  killed: boolean;
  stdout: string;
  stderr: string;
};

type CustomToolApi = {
  zod: {
    string(): {
      trim(): {
        min(length: number, message: string): unknown;
      };
    };
    object(shape: { prompt: unknown }): unknown;
  };
  exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<ExecResult>;
};


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function agyGenerateImage(pi: CustomToolApi) {
  return {
    name: "agy_generate_image",
    label: "Generate Image with agy",
    description: "Generate an image with the locally installed agy CLI and return its verified path.",
    parameters: pi.zod.object({
      prompt: pi.zod.string().trim().min(1, "Prompt must not be empty"),
    }),

    async execute(
      _toolCallId: string,
      params: { prompt: string },
      _onUpdate: unknown,
      _ctx: unknown,
      signal: AbortSignal,
    ) {
      const generationPrompt = `${params.prompt}\n\n${OUTPUT_INSTRUCTION}`;

      let agyResult: ExecResult;
      try {
        agyResult = await pi.exec("agy", ["--print", generationPrompt], { signal });
      } catch (error) {
        throw new Error(`agy execution failed while invoking the CLI: ${errorMessage(error)}`);
      }

      if (agyResult.killed) {
        throw new Error("agy execution failed: the CLI process was killed or cancelled.");
      }
      if (agyResult.code !== 0) {
        const stderr = agyResult.stderr.trim();
        throw new Error(
          `agy execution failed with exit code ${agyResult.code ?? "unknown"}${stderr ? `: ${stderr}` : ""}`,
        );
      }

      const output = agyResult.stdout;
      const imagePath = output.split(/\r?\n/).map((line: string) => line.trim()).find((line: string) => {
        return isAbsolute(line) && IMAGE_EXTENSIONS[extname(line).toLowerCase()] === true;
      });
      if (!imagePath) {
        throw new Error(
          "image path parsing failed: agy output contained no absolute .jpg, .jpeg, .png, or .webp path.",
        );
      }

      let resolvedImagePath: string;
      try {
        resolvedImagePath = await fs.realpath(imagePath);
      } catch (error) {
        throw new Error(
          `image file existence validation failed: could not resolve generated path ${imagePath}: ${errorMessage(error)}`,
        );
      }

      let imageStat;
      try {
        imageStat = await fs.stat(resolvedImagePath);
      } catch (error) {
        throw new Error(
          `image file existence validation failed: could not inspect ${resolvedImagePath}: ${errorMessage(error)}`,
        );
      }
      if (!imageStat.isFile()) {
        throw new Error(`image file existence validation failed: ${resolvedImagePath} is not a regular file.`);
      }

      let mimeResult: ExecResult;
      try {
        mimeResult = await pi.exec("file", ["--brief", "--mime-type", "--", resolvedImagePath], { signal });
      } catch (error) {
        throw new Error(`MIME validation failed while invoking file: ${errorMessage(error)}`);
      }
      if (mimeResult.killed) {
        throw new Error("MIME validation failed: the file process was killed or cancelled.");
      }
      if (mimeResult.code !== 0) {
        const stderr = mimeResult.stderr.trim();
        throw new Error(
          `MIME validation failed with exit code ${mimeResult.code ?? "unknown"}${stderr ? `: ${stderr}` : ""}`,
        );
      }

      const mimeType = mimeResult.stdout.trim();
      if (IMAGE_MIME_TYPES[mimeType] !== true) {
        throw new Error(
          `MIME validation failed: file reported ${mimeType || "no MIME type"}; expected image/jpeg, image/png, or image/webp.`,
        );
      }

      return {
        content: [{ type: "text", text: `Generated image: ${resolvedImagePath} (${mimeType})` }],
        details: { imagePath: resolvedImagePath, mimeType },
      };
    },
  };
}
