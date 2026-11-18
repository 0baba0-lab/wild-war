using UnityEngine;
using UnityEngine.Tilemaps;
using Unity.Netcode;

[RequireComponent(typeof(Tilemap), typeof(NetworkObject))]
public class TileClick : NetworkBehaviour
{
    private Tilemap tilemap;

    private void Awake()
    {
        tilemap = GetComponent<Tilemap>();
    }

    private void Update()
    {
        // 서버에 접속한 플레이어가 클릭한 칸을 찾는다.
        if (!IsSpawned || !IsClient || !NetworkManager.IsConnectedClient ||
            !Input.GetMouseButtonDown(0))
        {
            return;
        }

        Camera camera = Camera.main;
        Vector3 screen = Input.mousePosition;
        screen.z = transform.position.z - camera.transform.position.z;

        Vector3 world = camera.ScreenToWorldPoint(screen);
        Vector3Int cell = tilemap.WorldToCell(world);

        if (tilemap.HasTile(cell))
        {
            Debug.Log($"클릭한 칸 ({cell.x + 1}, {cell.y + 1})");
            PaintTileRpc(cell.x, cell.y);
        }
    }

    [Rpc(SendTo.Server, InvokePermission = RpcInvokePermission.Everyone)]
    private void PaintTileRpc(int x, int y)
    {
        // 서버에서 실제로 존재하는 칸인지 검사한다.
        if (tilemap.HasTile(new Vector3Int(x, y, 0)))
        {
            ApplyColorRpc(x, y);
        }
    }

    [Rpc(SendTo.Everyone, InvokePermission = RpcInvokePermission.Server)]
    private void ApplyColorRpc(int x, int y)
    {
        // 서버가 확정한 색 변경을 현재 참가자에게 반영한다.
        Vector3Int cell = new Vector3Int(x, y, 0);
        tilemap.RemoveTileFlags(cell, TileFlags.LockColor);
        tilemap.SetColor(cell, new Color32(48, 128, 255, 255));
    }
}