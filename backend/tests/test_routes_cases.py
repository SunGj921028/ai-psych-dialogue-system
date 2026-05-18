from __future__ import annotations


def test_create_list_get_and_delete_case(client):
    create_response = client.post(
        "/api/cases",
        json={"code_name": "A001", "note": "first contact note"},
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["id"]
    assert created["code_name"] == "A001"
    assert created["note"] == "first contact note"
    assert created["created_at"]

    list_response = client.get("/api/cases")

    assert list_response.status_code == 200
    assert list_response.json() == [created]

    get_response = client.get(f"/api/cases/{created['id']}")

    assert get_response.status_code == 200
    assert get_response.json() == created

    delete_response = client.delete(f"/api/cases/{created['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}


def test_missing_case_returns_404(client):
    get_response = client.get("/api/cases/missing-case")
    delete_response = client.delete("/api/cases/missing-case")

    assert get_response.status_code == 404
    assert delete_response.status_code == 404
