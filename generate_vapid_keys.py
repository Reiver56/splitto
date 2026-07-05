"""Genera la coppia di chiavi VAPID necessaria per le notifiche Web Push.

Uso:
    python generate_vapid_keys.py

Crea (se non esiste gia') il file vapid_private_key.pem nella cartella del
progetto e stampa a schermo il valore VAPID_PUBLIC_KEY da copiare nel file .env.
"""

import base64
import os

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

PRIVATE_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vapid_private_key.pem")


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main():
    if os.path.exists(PRIVATE_KEY_FILE):
        print(f"Trovato '{os.path.basename(PRIVATE_KEY_FILE)}' esistente: le chiavi non vengono rigenerate.")
        with open(PRIVATE_KEY_FILE, "rb") as f:
            private_key = serialization.load_pem_private_key(f.read(), password=None)
    else:
        private_key = ec.generate_private_key(ec.SECP256R1())
        pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        with open(PRIVATE_KEY_FILE, "wb") as f:
            f.write(pem)
        print(f"Nuova chiave privata VAPID generata e salvata in: {PRIVATE_KEY_FILE}")

    public_numbers = private_key.public_key().public_numbers()
    raw_public = b"\x04" + public_numbers.x.to_bytes(32, "big") + public_numbers.y.to_bytes(32, "big")
    public_key_b64 = b64url(raw_public)

    print("\nCopia queste righe nel tuo file .env:\n")
    print(f"VAPID_PRIVATE_KEY_FILE={os.path.basename(PRIVATE_KEY_FILE)}")
    print(f"VAPID_PUBLIC_KEY={public_key_b64}")


if __name__ == "__main__":
    main()
