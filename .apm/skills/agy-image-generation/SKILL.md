---
name: agy-image-generation
description: Generates and verifies one image file through the local Antigravity `agy` CLI when a user requests a single new local image asset. Use for single prompt-to-image generation with a returned local file path; do not use for image analysis, image edits, reference images, batch requests, or providers other than agy.
license: MIT
metadata:
  author: openspec-workflows
  version: "1.0"
---

# Generate Images with agy

Use the OMP `agy_generate_image` custom tool to generate one new image through the locally installed `agy` CLI and return a verified image file.

## Preconditions

- `agy` is installed and authenticated on the local machine.
- The OMP custom tool at `.omp/tools/agy_generate_image.ts` is discoverable in the current session. Restart OMP after adding the tool if it was not loaded at session start.
- The requested work is one new image. This workflow does not support edits, reference images, or batches.

## Inputs and output

- **Input:** a concise visual brief: subject, action, scene, composition, lighting, style, and any required readable text.
- **Output:** one verified absolute JPEG, PNG, or WebP file path returned by `agy`.

## Procedure

1. Reduce the user's request to a single image brief. Preserve explicit visual constraints; do not invent brand assets, people, text, or reference imagery.
2. Call `agy_generate_image` with that brief as `prompt`.
3. Use only the verified path returned by the tool as the generated asset. Do not infer an asset path from conversational output.
4. Inspect the returned image before claiming it satisfies the brief. Use the available image-reading or image-inspection capability; check the requested subject, composition, visible text, and obvious artifacts.
5. Report the verified path and a brief result summary. Do not claim that an image was generated when the tool failed or when no verified path was returned.

## Failure handling

- The tool validates the CLI output and returned file. Do not bypass it by manually treating conversational output as a generated-asset path.
- If the tool returns an error, report that error. Do not fabricate an asset or silently substitute another provider.
- Do not use `agy --output-format json` for this workflow: the observed CLI session returned conversational prose rather than JSON.
- If the requested work needs an edit, reference image, batch, or provider-specific capability, explain that this skill does not support it and use an appropriate workflow instead.

## Trigger checks

Use this skill for requests such as:

- “Generate a square illustration of a mouse eating cheese with agy.”
- “Create a local JPEG hero image through Antigravity CLI.”
- “Make a photorealistic garden portrait using agy and give me the file.”

Do not use it for:

- “Describe this attached image.”
- “Edit this product photo using the supplied reference.”
- “Generate an image through OMP’s configured API provider.”
- “Generate three agy icons.”
