// Détenteurs successifs d'un équipement : clôt la période en cours et ouvre la nouvelle.
// Ne modifie que la table attributions (l'appelant met à jour equipements.utilisateur).
// detenteur null = appareil remis en stock.
export async function enregistrerAttribution(client, equipementId, d, auteur, origine) {
  await client.query(
    `UPDATE attributions SET en_cours = false, au = GREATEST(COALESCE(du, $2::date), $2::date)
      WHERE equipement_id = $1 AND en_cours`,
    [equipementId, d.date]
  );
  await client.query(
    `INSERT INTO attributions (equipement_id, detenteur, direction, site, emplacement, du, motif, commentaire,
                               origine, saisi_par, utilisateur_id, type_beneficiaire, structure_id, recu_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [equipementId, d.detenteur ?? null, d.direction ?? null, d.site ?? null, d.emplacement ?? null, d.date,
     d.motif ?? null, d.commentaire ?? null, origine, auteur?.nom ?? null, auteur?.id ?? null,
     d.type ?? null, d.structureId ?? null, d.recuPar ?? null]
  );
}
