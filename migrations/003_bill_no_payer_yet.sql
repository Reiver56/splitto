-- Permette di registrare una bolletta senza indicare subito chi l'ha pagata
-- (stato "in attesa di un pagante"). Le quote (bill_splits) per una bolletta
-- del genere vengono create solo quando qualcuno si assegna il pagamento.

ALTER TABLE bills ALTER COLUMN paid_by DROP NOT NULL;
