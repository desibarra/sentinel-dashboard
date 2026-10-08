import csv
import importlib.util
import io
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).with_name("update_efos_blacklist.py")
SPEC = importlib.util.spec_from_file_location("update_efos_blacklist", SCRIPT_PATH)
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)


def valid_sat_csv(record_count=1000):
    output = io.StringIO()
    output.write("Información actualizada al 1 de octubre de 2026\n")
    writer = csv.writer(output)
    for index in range(record_count):
        suffix = _base36(index).rjust(3, "0")
        row = [""] * 20
        row[1] = f"AAA010101{suffix}"
        row[2] = f"Contribuyente {index}"
        row[3] = "Definitivo"
        row[13] = "01/10/2026"
        writer.writerow(row)
    return output.getvalue()


def _base36(value):
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    if value == 0:
        return "0"
    result = ""
    while value:
        value, remainder = divmod(value, 36)
        result = digits[remainder] + result
    return result


class UpdateEfosBlacklistTests(unittest.TestCase):
    def test_sat_download_uses_https_and_default_certificate_validation(self):
        self.assertTrue(updater.SAT_69B_URL.startswith("https://"))
        response = io.BytesIO(b"csv")
        with patch.object(updater.urllib.request, "urlopen", return_value=response) as urlopen:
            self.assertEqual(updater.download(), "csv")
        self.assertEqual(urlopen.call_args.kwargs, {"timeout": 60})

    def test_download_validation_requires_official_date_and_complete_record_set(self):
        with self.assertRaisesRegex(ValueError, "fecha oficial"):
            updater.validate_download("contenido no verificable", date(2026, 10, 8))

        with self.assertRaisesRegex(ValueError, "registros válidos"):
            updater.validate_download(valid_sat_csv(999), date(2026, 10, 8))

        records, cutoff = updater.validate_download(valid_sat_csv(), date(2026, 10, 8))
        self.assertEqual(len(records), 1000)
        self.assertEqual(cutoff, "2026-10-01")

    def test_invalid_download_preserves_existing_list_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            public = root / "public"
            blacklists = public / "blacklists"
            blacklists.mkdir(parents=True)
            csv_path = blacklists / "Listado_69-B.csv"
            json_path = public / "69b.json"
            csv_path.write_text("previous csv", encoding="utf-8")
            json_path.write_text("previous json", encoding="utf-8")

            with (
                patch.object(updater, "PUBLIC_DIR", str(public)),
                patch.object(updater, "CSV_FILE", str(csv_path)),
                patch.object(updater, "JSON_FILE", str(json_path)),
                patch.object(updater, "BACKUP_DIR", str(root / "backups")),
                patch.object(updater, "download", return_value="invalid payload"),
            ):
                with self.assertRaises(ValueError):
                    updater.main()

            self.assertEqual(csv_path.read_text(encoding="utf-8"), "previous csv")
            self.assertEqual(json_path.read_text(encoding="utf-8"), "previous json")


if __name__ == "__main__":
    unittest.main()
