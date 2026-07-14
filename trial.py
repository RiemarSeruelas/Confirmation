from pathlib import Path
from docling.document_converter import DocumentConverter

folder = Path(__file__).resolve().parent

image_path = folder / "Production.png"
output_path = folder / "result.txt"

if not image_path.exists():
    raise FileNotFoundError(f"Image not found: {image_path}")

print(f"Processing: {image_path}")
print("The first run may take longer while Docling downloads its models.")

converter = DocumentConverter()
result = converter.convert(image_path)

text = result.document.export_to_markdown()

print("\n========== DOCLING RESULT ==========\n")
print(text)
print("\n====================================")

output_path.write_text(text, encoding="utf-8")

print(f"\nResult saved to: {output_path}")